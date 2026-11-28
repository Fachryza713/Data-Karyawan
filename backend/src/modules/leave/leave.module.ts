import { Module } from '@nestjs/common';
import { Clock } from '../../common/time/clock.js';
import { SettingsModule } from '../settings/settings.module.js';
import { ApprovedRemoteWorkPolicy } from './approved-remote-work.policy.js';
import { LeaveBalanceJob } from './leave-balance.job.js';
import { LeaveBalanceService } from './leave-balance.service.js';
import { LeaveBalancesController } from './leave-balances.controller.js';
import { LeaveRequestsController } from './leave-requests.controller.js';
import { LeaveRequestsService } from './leave-requests.service.js';
import { LeaveReviewService } from './leave-review.service.js';
import { LeaveTypesController } from './leave-types.controller.js';
import { MyLeaveRequestsController } from './my-leave-requests.controller.js';

/**
 * Pengajuan cuti/sakit/izin, WFH, dan dinas luar beserta approval HR dan
 * saldo cuti tahunan. Mengekspor LeaveBalanceService (saldo karyawan baru)
 * dan ApprovedRemoteWorkPolicy (izin absen di luar radius untuk modul absensi).
 * Butuh ScheduleModule.forRoot() di AppModule untuk job saldo 1 Januari.
 */
@Module({
  imports: [SettingsModule],
  // Urutan penting: /leave-requests/me harus terdaftar sebelum /leave-requests/:id.
  controllers: [
    MyLeaveRequestsController,
    LeaveRequestsController,
    LeaveBalancesController,
    LeaveTypesController,
  ],
  providers: [
    LeaveRequestsService,
    LeaveReviewService,
    LeaveBalanceService,
    LeaveBalanceJob,
    ApprovedRemoteWorkPolicy,
    Clock,
  ],
  exports: [LeaveBalanceService, ApprovedRemoteWorkPolicy],
})
export class LeaveModule {}
