import { Module } from '@nestjs/common';
import { Clock } from '../../common/time/clock.js';
import { ApprovedRemoteWorkPolicy } from '../leave/approved-remote-work.policy.js';
import { LeaveModule } from '../leave/leave.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AbsenceJob } from './absence.job.js';
import { AttendanceReportService } from './attendance-report.service.js';
import { AttendanceService } from './attendance.service.js';
import { AttendancesController } from './attendances.controller.js';
import { GeoService } from './geo.service.js';
import { MyAttendanceController } from './my-attendance.controller.js';
import { REMOTE_WORK_POLICY } from './remote-work.policy.js';

/**
 * Presensi GPS: absen masuk/pulang karyawan, log dan ekspor HR, serta job
 * harian penandaan alpa. Izin absen di luar radius berasal dari pengajuan
 * WFH/dinas yang disetujui (LeaveModule). Butuh ScheduleModule.forRoot() di
 * AppModule.
 */
@Module({
  imports: [SettingsModule, LeaveModule],
  controllers: [MyAttendanceController, AttendancesController],
  providers: [
    AttendanceService,
    AttendanceReportService,
    AbsenceJob,
    GeoService,
    Clock,
    // AttendanceService hanya mengenal interface RemoteWorkPolicy.
    { provide: REMOTE_WORK_POLICY, useExisting: ApprovedRemoteWorkPolicy },
  ],
})
export class AttendanceModule {}
