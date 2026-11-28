import { Injectable, NotFoundException } from '@nestjs/common';
import { parseMoney } from '../../common/money/money.js';
import { Clock } from '../../common/time/clock.js';
import {
  parseDateOnly,
  toWibDateOnly,
} from '../../common/validation/date-only.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { INCLUDE_DELETED } from '../../prisma/soft-delete.extension.js';
import { diffSnapshots } from '../audit/audit-sanitize.js';
import { AuditService } from '../audit/audit.service.js';
import { EmployeeMessages } from '../employees/employees.constants.js';
import type {
  CreateBenefitDto,
  CreateSalaryStructureDto,
  UpdateBenefitDto,
} from './dto/payroll-request.dto.js';
import type {
  BenefitResponseDto,
  SalaryStructureResponseDto,
} from './dto/payroll-response.dto.js';
import { effectiveStructure } from './payroll-rules.js';
import { PayrollEntities, PayrollMessages } from './payroll.constants.js';
import {
  BENEFIT_SELECT,
  type BenefitRow,
  benefitSnapshot,
  SALARY_STRUCTURE_SELECT,
  salaryStructureSnapshot,
  toBenefitDto,
  toSalaryStructureDto,
} from './payroll.mapper.js';

/** Urutan "terbaru dulu": effectiveFrom, lalu yang dibuat terakhir. */
const NEWEST_FIRST = [
  { effectiveFrom: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
] as const;

/**
 * Struktur gaji dan manfaat (BPJS/asuransi) per karyawan, dikelola HR.
 * Struktur gaji hanya ditambah: perubahan gaji = baris baru, sehingga
 * riwayat dan slip lama tetap bisa ditelusuri.
 */
@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /**
   * Tambah struktur gaji baru. Baris lama tidak pernah diubah; AuditLog
   * mencatat struktur terbaru sebelumnya (before) dan yang baru (after).
   */
  async createSalaryStructure(
    employeeId: string,
    dto: CreateSalaryStructureDto,
  ): Promise<SalaryStructureResponseDto> {
    await this.assertActiveEmployee(employeeId);
    const created = await this.prisma.client.$transaction(async (tx) => {
      const previous = await tx.salaryStructure.findFirst({
        where: { employeeId },
        orderBy: [...NEWEST_FIRST],
        select: SALARY_STRUCTURE_SELECT,
      });
      const row = await tx.salaryStructure.create({
        data: {
          employeeId,
          baseSalary: parseMoney(dto.baseSalary),
          fixedAllowance: parseMoney(dto.fixedAllowance ?? '0'),
          bankName: dto.bankName,
          bankAccountLast4: dto.bankAccountLast4,
          effectiveFrom: parseDateOnly(dto.effectiveFrom),
        },
        select: SALARY_STRUCTURE_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: PayrollEntities.salaryStructure,
          entityId: row.id,
          before: previous ? salaryStructureSnapshot(previous) : null,
          after: { employeeId, ...salaryStructureSnapshot(row) },
        },
        tx,
      );
      return row;
    });
    const current = effectiveStructure(
      await this.structuresOf(employeeId),
      this.today(),
    );
    return toSalaryStructureDto(created, current?.id ?? null);
  }

  /** Riwayat gaji terbaru dulu; isCurrent = yang berlaku hari ini (WIB). */
  async listSalaryStructures(
    employeeId: string,
  ): Promise<SalaryStructureResponseDto[]> {
    await this.assertEmployeeExists(employeeId);
    const rows = await this.structuresOf(employeeId);
    const current = effectiveStructure(rows, this.today());
    return rows.map((row) => toSalaryStructureDto(row, current?.id ?? null));
  }

  async listBenefits(employeeId: string): Promise<BenefitResponseDto[]> {
    await this.assertEmployeeExists(employeeId);
    return this.benefitsOf(employeeId);
  }

  async createBenefit(
    employeeId: string,
    dto: CreateBenefitDto,
  ): Promise<BenefitResponseDto> {
    await this.assertActiveEmployee(employeeId);
    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.benefit.create({
        data: {
          employeeId,
          provider: dto.provider,
          program: dto.program ?? null,
          cardNo: dto.cardNo ?? null,
          class: dto.class ?? null,
          dependents: dto.dependents ?? 0,
          ...(dto.status && { status: dto.status }),
        },
        select: BENEFIT_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: PayrollEntities.benefit,
          entityId: created.id,
          after: benefitSnapshot(created),
        },
        tx,
      );
      return created;
    });
    return toBenefitDto(row);
  }

  /** Ubah field yang dikirim saja; tanpa perubahan = tanpa tulis dan audit. */
  async updateBenefit(
    employeeId: string,
    benefitId: string,
    dto: UpdateBenefitDto,
  ): Promise<BenefitResponseDto> {
    const current = await this.findBenefit(employeeId, benefitId);
    const before = benefitSnapshot(current);
    const requested = Object.fromEntries(
      Object.entries({
        provider: dto.provider,
        program: dto.program,
        cardNo: dto.cardNo,
        class: dto.class,
        dependents: dto.dependents,
        status: dto.status,
      }).filter(([, value]) => value !== undefined),
    );
    const diff = diffSnapshots(before, { ...before, ...requested });
    if (!diff) {
      return toBenefitDto(current);
    }
    const row = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.benefit.update({
        where: { id: benefitId },
        data: diff.after,
        select: BENEFIT_SELECT,
      });
      await this.audit.recordChange(
        { entity: PayrollEntities.benefit, entityId: benefitId, ...diff },
        tx,
      );
      return updated;
    });
    return toBenefitDto(row);
  }

  async removeBenefit(employeeId: string, benefitId: string): Promise<void> {
    const current = await this.findBenefit(employeeId, benefitId);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.benefit.delete({ where: { id: benefitId } });
      await this.audit.recordChange(
        {
          entity: PayrollEntities.benefit,
          entityId: benefitId,
          before: benefitSnapshot(current),
        },
        tx,
      );
    });
  }

  /** Manfaat milik karyawan yang login (GET /benefits/me). */
  async listMyBenefits(userId: string): Promise<BenefitResponseDto[]> {
    const employee = await this.prisma.client.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException(EmployeeMessages.noEmployeeRecord);
    }
    return this.benefitsOf(employee.id);
  }

  private structuresOf(employeeId: string) {
    return this.prisma.client.salaryStructure.findMany({
      where: { employeeId },
      orderBy: [...NEWEST_FIRST],
      select: SALARY_STRUCTURE_SELECT,
    });
  }

  private async benefitsOf(employeeId: string): Promise<BenefitResponseDto[]> {
    const rows = await this.prisma.client.benefit.findMany({
      where: { employeeId },
      orderBy: [{ status: 'asc' }, { provider: 'asc' }, { id: 'asc' }],
      select: BENEFIT_SELECT,
    });
    return rows.map(toBenefitDto);
  }

  private async findBenefit(
    employeeId: string,
    benefitId: string,
  ): Promise<BenefitRow> {
    const row = await this.prisma.client.benefit.findFirst({
      where: { id: benefitId, employeeId },
      select: BENEFIT_SELECT,
    });
    if (!row) {
      throw new NotFoundException(PayrollMessages.benefitNotFound);
    }
    return row;
  }

  /** Perubahan hanya untuk karyawan aktif (soft delete = 404). */
  private async assertActiveEmployee(employeeId: string): Promise<void> {
    const employee = await this.prisma.client.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException(PayrollMessages.employeeNotFound);
    }
  }

  /** Riwayat tetap bisa dibaca untuk karyawan nonaktif. */
  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.client.employee.findUnique({
      where: { id: employeeId, ...INCLUDE_DELETED },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException(PayrollMessages.employeeNotFound);
    }
  }

  private today(): string {
    return toWibDateOnly(this.clock.now());
  }
}
