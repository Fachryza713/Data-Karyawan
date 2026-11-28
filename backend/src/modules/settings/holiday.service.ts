import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  parseDateOnly,
  toDateOnly,
} from '../../common/validation/date-only.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CreateHolidayDto,
  HolidayResponseDto,
  ListHolidaysQueryDto,
} from './dto/holiday.dto.js';
import { SettingsMessages } from './settings.constants.js';
import {
  countWorkingDays,
  type DateInput,
  isWeekend,
  listWorkingDays,
  toCalendarDate,
} from './working-days.js';

const ENTITY = 'Holiday';

const HOLIDAY_SELECT = {
  id: true,
  date: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.HolidaySelect;

type HolidayRow = Prisma.HolidayGetPayload<{ select: typeof HOLIDAY_SELECT }>;

function toDto(row: HolidayRow): HolidayResponseDto {
  return {
    id: row.id,
    date: toDateOnly(row.date),
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Hari libur nasional dan kalender hari kerja. isWorkingDay dan
 * workingDaysBetween/workingDatesBetween dipakai modul absensi, cuti, dan payroll.
 */
@Injectable()
export class HolidayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListHolidaysQueryDto): Promise<HolidayResponseDto[]> {
    const rows = await this.prisma.client.holiday.findMany({
      where:
        query.year === undefined
          ? {}
          : {
              date: {
                gte: parseDateOnly(`${query.year}-01-01`),
                lte: parseDateOnly(`${query.year}-12-31`),
              },
            },
      orderBy: { date: 'asc' },
      select: HOLIDAY_SELECT,
    });
    return rows.map(toDto);
  }

  /** Tambah hari libur. Satu tanggal hanya boleh satu hari libur (409). */
  async create(dto: CreateHolidayDto): Promise<HolidayResponseDto> {
    const date = parseDateOnly(dto.date);
    const existing = await this.prisma.client.holiday.findUnique({
      where: { date },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new ConflictException({
        message: `Tanggal ${dto.date} sudah terdaftar sebagai hari libur: ${existing.name}`,
        details: { holidayId: existing.id },
      });
    }

    const row = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.holiday.create({
        data: { date, name: dto.name },
        select: HOLIDAY_SELECT,
      });
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: created.id,
          after: { date: dto.date, name: created.name },
        },
        tx,
      );
      return created;
    });
    return toDto(row);
  }

  async remove(id: string): Promise<void> {
    const holiday = await this.prisma.client.holiday.findUnique({
      where: { id },
      select: HOLIDAY_SELECT,
    });
    if (!holiday) {
      throw new NotFoundException(SettingsMessages.holidayNotFound);
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id } });
      await this.audit.recordChange(
        {
          entity: ENTITY,
          entityId: id,
          before: { date: toDateOnly(holiday.date), name: holiday.name },
        },
        tx,
      );
    });
  }

  /**
   * True jika tanggal itu Senin-Jumat dan bukan hari libur. Date dibaca
   * sebagai tanggal WIB (waktu presensi maupun nilai kolom @db.Date).
   */
  async isWorkingDay(date: DateInput): Promise<boolean> {
    const day = toCalendarDate(date);
    if (isWeekend(day)) {
      return false;
    }
    const holiday = await this.prisma.client.holiday.findUnique({
      where: { date: parseDateOnly(day) },
      select: { id: true },
    });
    return holiday === null;
  }

  /**
   * Jumlah hari kerja dari start sampai end, keduanya ikut dihitung, tanpa
   * Sabtu, Minggu, dan hari libur. start setelah end menghasilkan 0.
   */
  async workingDaysBetween(start: DateInput, end: DateInput): Promise<number> {
    const from = toCalendarDate(start);
    const to = toCalendarDate(end);
    if (from > to) {
      return 0;
    }
    return countWorkingDays(from, to, await this.holidayDates(from, to));
  }

  /**
   * Tanggal hari kerja ("YYYY-MM-DD") dari start sampai end, inklusif, urut
   * naik. Jumlahnya sama dengan workingDaysBetween.
   */
  async workingDatesBetween(
    start: DateInput,
    end: DateInput,
  ): Promise<string[]> {
    const from = toCalendarDate(start);
    const to = toCalendarDate(end);
    if (from > to) {
      return [];
    }
    return listWorkingDays(from, to, await this.holidayDates(from, to));
  }

  private async holidayDates(from: string, to: string): Promise<string[]> {
    const holidays = await this.prisma.client.holiday.findMany({
      where: { date: { gte: parseDateOnly(from), lte: parseDateOnly(to) } },
      select: { date: true },
    });
    return holidays.map((holiday) => toDateOnly(holiday.date));
  }
}
