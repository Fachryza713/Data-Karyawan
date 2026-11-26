import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Clock } from '../../common/time/clock.js';
import {
  APP_TIME_ZONE,
  parseDateOnly,
} from '../../common/validation/date-only.js';
import { AttendanceStatus, Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisLockService } from '../../redis/redis-lock.service.js';
import { HolidayService } from '../settings/holiday.service.js';
import { toWibClock } from './attendance-rules.js';
import {
  MARK_ABSENT_CRON,
  MARK_ABSENT_LOCK_PREFIX,
  MARK_ABSENT_LOCK_TTL_MS,
} from './attendance.constants.js';

/** Hasil satu kali job: jumlah baris ABSENT, atau alasan dilewati. */
export type MarkAbsentRun =
  | { ran: true; marked: number }
  | { ran: false; reason: 'locked' | 'lock_unavailable' | 'failed' };

/**
 * Job harian 23:59 WIB: karyawan aktif (role EMPLOYEE, sudah mulai bekerja)
 * tanpa baris absensi di hari kerja ditandai ABSENT.
 */
@Injectable()
export class AbsenceJob {
  private readonly logger = new Logger(AbsenceJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidayService,
    private readonly lock: RedisLockService,
    private readonly clock: Clock,
  ) {}

  @Cron(MARK_ABSENT_CRON, {
    name: 'attendance-mark-absent',
    timeZone: APP_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    await this.run(toWibClock(this.clock.now()).date);
  }

  /**
   * Jalankan markAbsent di bawah lock Redis per tanggal, jadi hanya satu
   * instance API yang menjalankannya. Lock tidak dilepas setelah berhasil
   * (kedaluwarsa sendiri), supaya instance dengan jam sedikit terlambat tidak
   * mengulang. Jika gagal, lock dilepas agar bisa dicoba lagi. Tanpa Redis,
   * job dilewati (fail closed) dan dicatat di log.
   */
  async run(date: string): Promise<MarkAbsentRun> {
    const key = `${MARK_ABSENT_LOCK_PREFIX}${date}`;
    let token: string | null;
    try {
      token = await this.lock.acquire(key, MARK_ABSENT_LOCK_TTL_MS);
    } catch (error) {
      this.logger.error(
        `Penandaan alpa ${date} dilewati: lock Redis tidak tersedia`,
        error instanceof Error ? error.stack : String(error),
      );
      return { ran: false, reason: 'lock_unavailable' };
    }
    if (!token) {
      this.logger.log(
        `Penandaan alpa ${date} dilewati: sudah dijalankan instance lain`,
      );
      return { ran: false, reason: 'locked' };
    }

    try {
      const marked = await this.markAbsent(date);
      this.logger.log(`Penandaan alpa ${date}: ${marked} karyawan`);
      return { ran: true, marked };
    } catch (error) {
      this.logger.error(
        `Penandaan alpa ${date} gagal`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.lock.release(key, token).catch(() => undefined);
      return { ran: false, reason: 'failed' };
    }
  }

  /**
   * Tandai ABSENT untuk satu tanggal. Aman dijalankan ulang: baris yang sudah
   * ada (absen, cuti, atau ABSENT sebelumnya) tidak disentuh, dan
   * skipDuplicates menangani insert yang balapan dengan clock-in.
   */
  async markAbsent(date: string): Promise<number> {
    if (!(await this.holidays.isWorkingDay(date))) {
      return 0;
    }
    const day = parseDateOnly(date);
    const employees = await this.prisma.client.employee.findMany({
      where: {
        user: { role: Role.EMPLOYEE, isActive: true },
        joinDate: { lte: day },
        attendances: { none: { date: day } },
      },
      select: { id: true },
    });
    if (employees.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.client.attendance.createMany({
      data: employees.map((employee) => ({
        employeeId: employee.id,
        date: day,
        status: AttendanceStatus.ABSENT,
      })),
      skipDuplicates: true,
    });
    return count;
  }
}
