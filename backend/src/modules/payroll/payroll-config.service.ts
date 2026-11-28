import { ConflictException, Injectable } from '@nestjs/common';
import { parseMoney, parseRate } from '../../common/money/money.js';
import { Clock } from '../../common/time/clock.js';
import {
  parseDateOnly,
  toWibDateOnly,
} from '../../common/validation/date-only.js';
import { isPrismaError } from '../../prisma/prisma-errors.js';
import {
  type AppTransactionClient,
  PrismaService,
} from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  PayrollConfigQueryDto,
  UpdatePayrollConfigsDto,
} from './dto/payroll-request.dto.js';
import type { PayrollConfigListResponseDto } from './dto/payroll-response.dto.js';
import { PAYROLL_PROGRAMS } from './payroll-calculator.js';
import {
  assertConfigUpdate,
  type ConfigInput,
  type ResolvedRates,
  resolveRates,
} from './payroll-rules.js';
import { PayrollEntities, PayrollMessages } from './payroll.constants.js';
import {
  PAYROLL_CONFIG_SELECT,
  type PayrollConfigRow,
  toPayrollConfigDto,
} from './payroll.mapper.js';

/**
 * Tarif BPJS (PayrollConfig). Tarif tidak pernah ditimpa: setiap perubahan
 * menjadi baris baru dengan effectiveFrom-nya, dan payroll suatu periode
 * memakai baris terbaru yang berlaku di awal bulan.
 */
@Injectable()
export class PayrollConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** Tarif yang berlaku pada tanggal (default hari ini) + seluruh riwayat. */
  async list(
    query: PayrollConfigQueryDto,
  ): Promise<PayrollConfigListResponseDto> {
    const date = query.date ?? toWibDateOnly(this.clock.now());
    const rows = await this.allRows();
    const current = PAYROLL_PROGRAMS.flatMap((key) => {
      const row = latestOnOrBefore(rows, key, date);
      return row ? [toPayrollConfigDto(row)] : [];
    });
    return { date, current, history: rows.map(toPayrollConfigDto) };
  }

  /**
   * Tambah tarif baru yang berlaku mulai effectiveFrom. Semua program di
   * body tersimpan atau tidak sama sekali. Program + tanggal yang sudah ada
   * ditolak 409 (tarif lama tidak ditimpa). AuditLog: tarif yang berlaku
   * sebelum tanggal itu (before) dan tarif baru (after).
   */
  async update(
    dto: UpdatePayrollConfigsDto,
  ): Promise<PayrollConfigListResponseDto> {
    const inputs: ConfigInput[] = dto.configs.map((config) => ({
      key: config.key,
      employeeRate: parseRate(config.employeeRate),
      employerRate: parseRate(config.employerRate),
      wageCap: config.wageCap === null ? null : parseMoney(config.wageCap),
    }));
    assertConfigUpdate(dto.effectiveFrom, inputs);
    const effectiveFrom = parseDateOnly(dto.effectiveFrom);

    try {
      await this.prisma.client.$transaction(async (tx) => {
        const rows = await this.allRows(tx);
        const created: PayrollConfigRow[] = [];
        for (const input of inputs) {
          created.push(
            await tx.payrollConfig.create({
              data: { ...input, effectiveFrom },
              select: PAYROLL_CONFIG_SELECT,
            }),
          );
        }
        const before = Object.fromEntries(
          inputs.map((input) => {
            const previous = latestBefore(rows, input.key, dto.effectiveFrom);
            return [input.key, previous ? toPayrollConfigDto(previous) : null];
          }),
        );
        await this.audit.recordChange(
          {
            entity: PayrollEntities.config,
            entityId: dto.effectiveFrom,
            before,
            after: Object.fromEntries(
              created.map((row) => [row.key, toPayrollConfigDto(row)]),
            ),
          },
          tx,
        );
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException(PayrollMessages.configExists);
      }
      throw error;
    }
    return this.list({ date: dto.effectiveFrom });
  }

  /** Tarif kelima program pada tanggal (awal bulan periode); 422 jika kurang. */
  async ratesOn(
    date: string,
    tx?: AppTransactionClient,
  ): Promise<ResolvedRates> {
    return resolveRates(await this.allRows(tx), date);
  }

  private allRows(tx?: AppTransactionClient): Promise<PayrollConfigRow[]> {
    const db = tx ?? this.prisma.client;
    return db.payrollConfig.findMany({
      orderBy: [{ key: 'asc' }, { effectiveFrom: 'desc' }],
      select: PAYROLL_CONFIG_SELECT,
    });
  }
}

function latestOnOrBefore(
  rows: readonly PayrollConfigRow[],
  key: string,
  date: string,
): PayrollConfigRow | undefined {
  const limit = parseDateOnly(date);
  // rows urut effectiveFrom turun per key.
  return rows.find((row) => row.key === key && row.effectiveFrom <= limit);
}

function latestBefore(
  rows: readonly PayrollConfigRow[],
  key: string,
  date: string,
): PayrollConfigRow | undefined {
  const limit = parseDateOnly(date);
  return rows.find((row) => row.key === key && row.effectiveFrom < limit);
}
