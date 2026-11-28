import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { isPrismaError } from '../../prisma/prisma-errors.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CopyKpiTemplateDto,
  CreateKpiIndicatorDto,
  CreateKpiTemplateDto,
  ListKpiTemplatesQueryDto,
  UpdateKpiIndicatorDto,
  UpdateKpiTemplateDto,
} from './dto/kpi-request.dto.js';
import type {
  KpiIndicatorResponseDto,
  KpiTemplateResponseDto,
} from './dto/kpi-response.dto.js';
import {
  assertCanAddIndicator,
  hasDuplicateName,
  parsePercent,
} from './kpi-rules.js';
import { KpiEntities, KpiMessages } from './kpi.constants.js';
import {
  KPI_INDICATOR_SELECT,
  KPI_TEMPLATE_SELECT,
  type KpiTemplateRow,
  templateSnapshot,
  toIndicatorDto,
  toTemplateDto,
} from './kpi.mapper.js';

type IndicatorRow = Prisma.KpiIndicatorGetPayload<{
  select: typeof KPI_INDICATOR_SELECT;
}>;

/** Bobot harus > 0 (pola DTO sudah membatasi 0-100, 2 desimal). */
function parseWeight(value: string): Prisma.Decimal {
  const weight = parsePercent(value);
  if (weight.lessThanOrEqualTo(0)) {
    throw new UnprocessableEntityException(KpiMessages.weightPositive);
  }
  return weight;
}

const indicatorSnapshot = (row: IndicatorRow) => ({
  ...toIndicatorDto(row),
});

/**
 * Template KPI per jabatan beserta indikatornya. Satu template aktif per
 * jabatan: mengaktifkan template menonaktifkan template aktif lain di
 * jabatan yang sama dalam transaksi yang sama (index unik parsial
 * kpi_templates_one_active_per_position menjaga balapan). Template boleh
 * belum valid saat diedit; validitas (total bobot = 100) dilaporkan di
 * response dan diwajibkan saat periode diaktifkan. Penilaian yang sudah
 * dibuat memakai snapshot, jadi perubahan di sini tidak mengubahnya.
 */
@Injectable()
export class KpiTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ListKpiTemplatesQueryDto,
  ): Promise<KpiTemplateResponseDto[]> {
    const rows = await this.prisma.client.kpiTemplate.findMany({
      where: {
        ...(query.positionId ? { positionId: query.positionId } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      },
      orderBy: [{ position: { name: 'asc' } }, { createdAt: 'desc' }],
      select: KPI_TEMPLATE_SELECT,
    });
    return rows.map(toTemplateDto);
  }

  async findOne(id: string): Promise<KpiTemplateResponseDto> {
    return toTemplateDto(await this.findTemplate(this.prisma.client, id));
  }

  async create(dto: CreateKpiTemplateDto): Promise<KpiTemplateResponseDto> {
    const indicators = dto.indicators ?? [];
    if (hasDuplicateName(indicators.map((indicator) => indicator.name))) {
      throw new ConflictException(KpiMessages.duplicateIndicatorName);
    }
    const data = indicators.map((indicator, index) => ({
      name: indicator.name,
      description: indicator.description ?? null,
      weight: parseWeight(indicator.weight),
      target: indicator.target ?? null,
      order: indicator.order ?? index,
    }));
    const isActive = dto.isActive ?? true;

    return this.write(async (tx) => {
      await this.assertPositionExists(tx, dto.positionId);
      const replaced = isActive
        ? await this.deactivateOthers(tx, dto.positionId)
        : [];
      const created = await tx.kpiTemplate.create({
        data: {
          positionId: dto.positionId,
          name: dto.name,
          isActive,
          indicators: { create: data },
        },
        select: KPI_TEMPLATE_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: KpiEntities.template,
          entityId: created.id,
          after: { ...templateSnapshot(created), deactivated: replaced },
        },
        tx,
      );
      return created;
    });
  }

  async update(
    id: string,
    dto: UpdateKpiTemplateDto,
  ): Promise<KpiTemplateResponseDto> {
    return this.write(async (tx) => {
      const current = await this.findTemplate(tx, id);
      const activating = dto.isActive === true && !current.isActive;
      const replaced = activating
        ? await this.deactivateOthers(tx, current.positionId, id)
        : [];
      const updated = await tx.kpiTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        select: KPI_TEMPLATE_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: KpiEntities.template,
          entityId: id,
          before: templateSnapshot(current),
          after: { ...templateSnapshot(updated), deactivated: replaced },
        },
        tx,
      );
      return updated;
    });
  }

  /**
   * Salin template aktif jabatan sumber (nama, indikator, bobot, target,
   * urutan) menjadi template aktif baru jabatan tujuan.
   */
  async copy(dto: CopyKpiTemplateDto): Promise<KpiTemplateResponseDto> {
    if (dto.fromPositionId === dto.toPositionId) {
      throw new UnprocessableEntityException(KpiMessages.copySamePosition);
    }
    return this.write(async (tx) => {
      await this.assertPositionExists(tx, dto.fromPositionId);
      await this.assertPositionExists(tx, dto.toPositionId);
      const source = await tx.kpiTemplate.findFirst({
        where: { positionId: dto.fromPositionId, isActive: true },
        select: KPI_TEMPLATE_SELECT,
      });
      if (!source) {
        throw new UnprocessableEntityException(KpiMessages.copyNoSource);
      }
      const replaced = await this.deactivateOthers(tx, dto.toPositionId);
      const created = await tx.kpiTemplate.create({
        data: {
          positionId: dto.toPositionId,
          name: dto.name ?? `${source.name} (salinan)`.slice(0, 120),
          isActive: true,
          indicators: {
            create: source.indicators.map(
              ({ id: _id, ...indicator }) => indicator,
            ),
          },
        },
        select: KPI_TEMPLATE_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: KpiEntities.template,
          entityId: created.id,
          after: {
            ...templateSnapshot(created),
            copiedFromTemplateId: source.id,
            deactivated: replaced,
          },
        },
        tx,
      );
      return created;
    });
  }

  async addIndicator(
    templateId: string,
    dto: CreateKpiIndicatorDto,
  ): Promise<KpiIndicatorResponseDto> {
    const weight = parseWeight(dto.weight);
    return this.prisma.client.$transaction(async (tx) => {
      const template = await this.findTemplate(tx, templateId);
      assertCanAddIndicator(template.indicators.length);
      this.assertNameFree(template, dto.name);
      const lastOrder = Math.max(
        -1,
        ...template.indicators.map((indicator) => indicator.order),
      );
      const created = await tx.kpiIndicator.create({
        data: {
          templateId,
          name: dto.name,
          description: dto.description ?? null,
          weight,
          target: dto.target ?? null,
          order: dto.order ?? lastOrder + 1,
        },
        select: KPI_INDICATOR_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: KpiEntities.indicator,
          entityId: created.id,
          after: { templateId, ...indicatorSnapshot(created) },
        },
        tx,
      );
      return toIndicatorDto(created);
    });
  }

  async updateIndicator(
    templateId: string,
    indicatorId: string,
    dto: UpdateKpiIndicatorDto,
  ): Promise<KpiIndicatorResponseDto> {
    const weight =
      dto.weight !== undefined ? parseWeight(dto.weight) : undefined;
    return this.prisma.client.$transaction(async (tx) => {
      const template = await this.findTemplate(tx, templateId);
      const current = this.findIndicator(template, indicatorId);
      if (dto.name !== undefined) {
        this.assertNameFree(template, dto.name, indicatorId);
      }
      const updated = await tx.kpiIndicator.update({
        where: { id: indicatorId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(weight !== undefined && { weight }),
          ...(dto.target !== undefined && { target: dto.target }),
          ...(dto.order !== undefined && { order: dto.order }),
        },
        select: KPI_INDICATOR_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: KpiEntities.indicator,
          entityId: indicatorId,
          before: { templateId, ...indicatorSnapshot(current) },
          after: { templateId, ...indicatorSnapshot(updated) },
        },
        tx,
      );
      return toIndicatorDto(updated);
    });
  }

  async removeIndicator(
    templateId: string,
    indicatorId: string,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const template = await this.findTemplate(tx, templateId);
      const current = this.findIndicator(template, indicatorId);
      await tx.kpiIndicator.delete({ where: { id: indicatorId } });
      await this.audit.recordChange(
        {
          entity: KpiEntities.indicator,
          entityId: indicatorId,
          before: { templateId, ...indicatorSnapshot(current) },
        },
        tx,
      );
    });
  }

  /** Transaksi tulis template; bentrok index unik template aktif = 409. */
  private async write(
    fn: (tx: AppTransactionClient) => Promise<KpiTemplateRow>,
  ): Promise<KpiTemplateResponseDto> {
    try {
      return toTemplateDto(await this.prisma.client.$transaction(fn));
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(KpiMessages.activeTemplateConflict);
      }
      throw error;
    }
  }

  /** Nonaktifkan template aktif lain di jabatan ini; return id yang dinonaktifkan. */
  private async deactivateOthers(
    tx: AppTransactionClient,
    positionId: string,
    exceptId?: string,
  ): Promise<string[]> {
    const others = await tx.kpiTemplate.findMany({
      where: {
        positionId,
        isActive: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (others.length > 0) {
      await tx.kpiTemplate.updateMany({
        where: { id: { in: others.map((other) => other.id) } },
        data: { isActive: false },
      });
    }
    return others.map((other) => other.id);
  }

  private async assertPositionExists(
    tx: AppTransactionClient,
    positionId: string,
  ): Promise<void> {
    const position = await tx.position.findUnique({
      where: { id: positionId },
      select: { id: true },
    });
    if (!position) {
      throw new NotFoundException(KpiMessages.positionNotFound);
    }
  }

  private async findTemplate(
    db: AppTransactionClient | PrismaService['client'],
    id: string,
  ): Promise<KpiTemplateRow> {
    const row = await db.kpiTemplate.findUnique({
      where: { id },
      select: KPI_TEMPLATE_SELECT,
    });
    if (!row) {
      throw new NotFoundException(KpiMessages.templateNotFound);
    }
    return row;
  }

  private findIndicator(template: KpiTemplateRow, indicatorId: string) {
    const indicator = template.indicators.find((row) => row.id === indicatorId);
    if (!indicator) {
      throw new NotFoundException(KpiMessages.indicatorNotFound);
    }
    return indicator;
  }

  /** 409 jika nama sudah dipakai indikator lain di template ini. */
  private assertNameFree(
    template: KpiTemplateRow,
    name: string,
    exceptId?: string,
  ): void {
    const names = template.indicators
      .filter((indicator) => indicator.id !== exceptId)
      .map((indicator) => indicator.name);
    if (hasDuplicateName([...names, name])) {
      throw new ConflictException(KpiMessages.duplicateIndicatorName);
    }
  }
}
