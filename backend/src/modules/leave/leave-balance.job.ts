import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_TIME_ZONE } from '../../common/validation/date-only.js';
import { LeaveBalanceService } from './leave-balance.service.js';
import { LEAVE_BALANCE_CRON } from './leave.constants.js';

/**
 * Job 1 Januari 00:05 WIB: saldo cuti tahun baru untuk semua karyawan aktif.
 * Idempotent (lihat LeaveBalanceService.createForYear), jadi aman jika
 * beberapa instance API menjalankannya bersamaan atau dijalankan ulang.
 */
@Injectable()
export class LeaveBalanceJob {
  private readonly logger = new Logger(LeaveBalanceJob.name);

  constructor(private readonly balances: LeaveBalanceService) {}

  @Cron(LEAVE_BALANCE_CRON, {
    name: 'leave-balances-yearly',
    timeZone: APP_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    await this.run(this.balances.currentYear());
  }

  /** Jumlah saldo baru, atau null jika gagal (dicatat di log, tidak melempar). */
  async run(year: number): Promise<number | null> {
    try {
      const created = await this.balances.createForYear(year);
      this.logger.log(`Saldo cuti ${year}: ${created} karyawan`);
      return created;
    } catch (error) {
      this.logger.error(
        `Pembuatan saldo cuti ${year} gagal`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
