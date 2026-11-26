import { BadRequestException, Injectable } from '@nestjs/common';
import {
  buildPageMeta,
  pageToSkipTake,
} from '../../common/dto/pagination.dto.js';
import { Clock } from '../../common/time/clock.js';
import {
  parseDateOnly,
  toDateOnly,
} from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AttendanceStatus, Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { INCLUDE_DELETED } from '../../prisma/soft-delete.extension.js';
import { HolidayService } from '../settings/holiday.service.js';
import { csvCell, csvLine, CSV_BOM } from './attendance-csv.js';
import {
  resolveRange,
  type ResolvedRange,
  toWibClock,
} from './attendance-rules.js';
import {
  AttendanceMessages,
  EXPORT_BATCH_SIZE,
  MAX_RANGE_DAYS,
  MODE_LABELS,
  NOT_YET,
  STATUS_LABELS,
} from './attendance.constants.js';
import { ATTENDANCE_SELECT, toAttendanceDto } from './attendance.mapper.js';
import type {
  AttendanceFilterQueryDto,
  ListAttendancesQueryDto,
} from './dto/attendance-request.dto.js';
import type {
  AttendanceLogItemDto,
  AttendanceLogPageDto,
  AttendanceStatusCountsDto,
  AttendanceSummaryResponseDto,
  ClockPointDto,
} from './dto/attendance-response.dto.js';

const LOG_EMPLOYEE_SELECT = {
  id: true,
  nip: true,
  fullName: true,
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
} as const satisfies Prisma.EmployeeSelect;

type Page = { skip: number; take: number };

export const CSV_HEADER = [
  'Tanggal',
  'NIP',
  'Nama',
  'Departemen',
  'Jabatan',
  'Status',
  'Mode',
  'Jam masuk',
  'Jam pulang',
  'Terlambat (menit)',
  'Jarak masuk (m)',
  'Akurasi masuk (m)',
  'Lat masuk',
  'Lng masuk',
  'Jarak pulang (m)',
  'Akurasi pulang (m)',
  'Lat pulang',
  'Lng pulang',
];

function pointCells(point: ClockPointDto | null | undefined): string[] {
  return [
    csvCell(point?.distanceM),
    csvCell(point?.accuracyM),
    csvCell(point?.lat),
    csvCell(point?.lng),
  ];
}

/** Satu baris CSV dari item log (WIB, label bahasa Indonesia). */
export function toCsvCells(item: AttendanceLogItemDto): string[] {
  const attendance = item.attendance;
  return [
    csvCell(item.date),
    csvCell(item.employee.nip, { text: true }),
    csvCell(item.employee.fullName, { text: true }),
    csvCell(item.employee.department.name, { text: true }),
    csvCell(item.employee.position.name, { text: true }),
    csvCell(STATUS_LABELS[item.status]),
    csvCell(attendance?.mode ? MODE_LABELS[attendance.mode] : null),
    csvCell(attendance?.clockIn?.time),
    csvCell(attendance?.clockOut?.time),
    csvCell(attendance?.lateMinutes),
    ...pointCells(attendance?.clockIn),
    ...pointCells(attendance?.clockOut),
  ];
}

/** Jumlah per status; NOT_YET = karyawan yang dihitung tanpa baris absensi. */
export function buildStatusCounts(
  total: number,
  groups: ReadonlyArray<{ status: AttendanceStatus; count: number }>,
): AttendanceStatusCountsDto {
  const counts = Object.fromEntries(
    Object.values(AttendanceStatus).map((status) => [status, 0]),
  ) as Record<AttendanceStatus, number>;
  let recorded = 0;
  for (const group of groups) {
    counts[group.status] += group.count;
    recorded += group.count;
  }
  return { ...counts, NOT_YET: Math.max(total - recorded, 0) };
}

/**
 * Log presensi untuk HR. Satu tanggal: satu baris per karyawan, termasuk
 * yang belum absen (NOT_YET). Rentang: hanya baris absensi yang ada.
 * Hanya akun role EMPLOYEE (HR tidak absen, sama dengan versi Supabase).
 */
@Injectable()
export class AttendanceReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidayService,
    private readonly clock: Clock,
  ) {}

  async list(query: ListAttendancesQueryDto): Promise<AttendanceLogPageDto> {
    const range = this.resolve(query);
    const [items, total] = await Promise.all([
      this.fetchItems(range, query, pageToSkipTake(query.page, query.limit)),
      this.count(range, query),
    ]);
    return {
      data: items,
      meta: {
        ...buildPageMeta(query.page, query.limit, total),
        from: range.from,
        to: range.to,
      },
    };
  }

  async summary(date?: string): Promise<AttendanceSummaryResponseDto> {
    const target = date ?? this.today();
    const day = parseDateOnly(target);
    const [total, groups, isWorkingDay] = await Promise.all([
      this.prisma.client.employee.count({
        where: this.dayEmployeeWhere(day, {}),
      }),
      this.prisma.client.attendance.groupBy({
        by: ['status'],
        where: {
          date: day,
          employee: { user: { role: Role.EMPLOYEE }, joinDate: { lte: day } },
        },
        _count: { _all: true },
      }),
      this.holidays.isWorkingDay(target),
    ]);
    return {
      date: target,
      isWorkingDay,
      total,
      byStatus: buildStatusCounts(
        total,
        groups.map((group) => ({
          status: group.status,
          count: group._count._all,
        })),
      ),
    };
  }

  /**
   * Validasi filter langsung (error 400 sebelum stream dimulai), lalu baris
   * CSV ditulis per batch supaya data besar tidak dimuat sekaligus.
   */
  exportCsv(filter: AttendanceFilterQueryDto): {
    filename: string;
    lines: AsyncGenerator<string>;
  } {
    const range = this.resolve(filter);
    const suffix =
      range.from === range.to ? range.from : `${range.from}_${range.to}`;
    return {
      filename: `absensi_${suffix}.csv`,
      lines: this.csvLines(range, filter),
    };
  }

  private async *csvLines(
    range: ResolvedRange,
    filter: AttendanceFilterQueryDto,
  ): AsyncGenerator<string> {
    yield CSV_BOM + csvLine(CSV_HEADER);
    for (let skip = 0; ; skip += EXPORT_BATCH_SIZE) {
      const items = await this.fetchItems(range, filter, {
        skip,
        take: EXPORT_BATCH_SIZE,
      });
      for (const item of items) {
        yield csvLine(toCsvCells(item));
      }
      if (items.length < EXPORT_BATCH_SIZE) {
        return;
      }
    }
  }

  private today(): string {
    return toWibClock(this.clock.now()).date;
  }

  private resolve(filter: AttendanceFilterQueryDto): ResolvedRange {
    const result = resolveRange(filter, this.today(), MAX_RANGE_DAYS);
    if ('error' in result) {
      throw new BadRequestException(AttendanceMessages[result.error]);
    }
    if (filter.status === NOT_YET && !result.single) {
      throw new BadRequestException(AttendanceMessages.notYetNeedsSingleDate);
    }
    return result;
  }

  private async fetchItems(
    range: ResolvedRange,
    filter: AttendanceFilterQueryDto,
    page: Page,
  ): Promise<AttendanceLogItemDto[]> {
    if (range.single) {
      const day = parseDateOnly(range.from);
      const employees = await this.prisma.client.employee.findMany({
        where: this.dayEmployeeWhere(day, filter),
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        select: {
          ...LOG_EMPLOYEE_SELECT,
          attendances: {
            where: { date: day },
            select: ATTENDANCE_SELECT,
            take: 1,
          },
        },
        ...page,
      });
      return employees.map(({ attendances, ...employee }) => {
        const row = attendances.at(0);
        return {
          date: range.from,
          status: row?.status ?? NOT_YET,
          employee,
          attendance: row ? toAttendanceDto(row) : null,
        };
      });
    }

    const rows = await this.prisma.client.attendance.findMany({
      where: this.rangeAttendanceWhere(range, filter),
      orderBy: [
        { date: 'asc' },
        { employee: { fullName: 'asc' } },
        { id: 'asc' },
      ],
      select: {
        ...ATTENDANCE_SELECT,
        employee: { select: LOG_EMPLOYEE_SELECT },
      },
      ...page,
    });
    return rows.map(({ employee, ...row }) => ({
      date: toDateOnly(row.date),
      status: row.status,
      employee,
      attendance: toAttendanceDto(row),
    }));
  }

  private count(
    range: ResolvedRange,
    filter: AttendanceFilterQueryDto,
  ): Promise<number> {
    if (range.single) {
      return this.prisma.client.employee.count({
        where: this.dayEmployeeWhere(parseDateOnly(range.from), filter),
      });
    }
    return this.prisma.client.attendance.count({
      where: this.rangeAttendanceWhere(range, filter),
    });
  }

  /** Filter karyawan bersama (role, departemen, pencarian nama/NIP). */
  private employeeFilter(
    filter: AttendanceFilterQueryDto,
  ): Prisma.EmployeeWhereInput {
    return {
      user: { role: Role.EMPLOYEE },
      ...(filter.departmentId && { departmentId: filter.departmentId }),
      ...(filter.search && {
        OR: [
          { fullName: { contains: filter.search, mode: 'insensitive' } },
          { nip: { contains: filter.search, mode: 'insensitive' } },
        ],
      }),
    };
  }

  /**
   * Karyawan yang tampil di log satu tanggal: sudah mulai bekerja, dan masih
   * aktif atau punya catatan di tanggal itu (karyawan yang sudah keluar
   * tetap muncul di tanggal lampau yang ada catatannya).
   */
  private dayEmployeeWhere(
    day: Date,
    filter: AttendanceFilterQueryDto,
  ): Prisma.EmployeeWhereInput {
    const conditions: Prisma.EmployeeWhereInput[] = [
      {
        OR: [
          { deletedAt: null, user: { isActive: true } },
          { attendances: { some: { date: day } } },
        ],
      },
    ];
    if (filter.status === NOT_YET) {
      conditions.push({ attendances: { none: { date: day } } });
    } else if (filter.status) {
      conditions.push({
        attendances: { some: { date: day, status: filter.status } },
      });
    }
    return {
      // Filter soft delete otomatis dimatikan; aturannya ada di OR di atas.
      ...INCLUDE_DELETED,
      ...this.employeeFilter(filter),
      joinDate: { lte: day },
      AND: conditions,
    };
  }

  private rangeAttendanceWhere(
    range: ResolvedRange,
    filter: AttendanceFilterQueryDto,
  ): Prisma.AttendanceWhereInput {
    return {
      date: { gte: parseDateOnly(range.from), lte: parseDateOnly(range.to) },
      // NOT_YET sudah ditolak untuk rentang di resolve().
      ...(filter.status &&
        filter.status !== NOT_YET && { status: filter.status }),
      employee: this.employeeFilter(filter),
    };
  }
}
