import { Module } from '@nestjs/common';
import { Clock } from '../../common/time/clock.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AbsenceJob } from './absence.job.js';
import { AttendanceReportService } from './attendance-report.service.js';
import { AttendanceService } from './attendance.service.js';
import { AttendancesController } from './attendances.controller.js';
import { GeoService } from './geo.service.js';
import { MyAttendanceController } from './my-attendance.controller.js';
import {
  NoRemoteWorkPolicy,
  REMOTE_WORK_POLICY,
} from './remote-work.policy.js';

/**
 * Presensi GPS: absen masuk/pulang karyawan, log dan ekspor HR, serta job
 * harian penandaan alpa. Butuh ScheduleModule.forRoot() di AppModule.
 */
@Module({
  imports: [SettingsModule],
  controllers: [MyAttendanceController, AttendancesController],
  providers: [
    AttendanceService,
    AttendanceReportService,
    AbsenceJob,
    GeoService,
    Clock,
    // Diganti implementasi berbasis pengajuan WFH/dinas di prompt cuti/WFH.
    { provide: REMOTE_WORK_POLICY, useClass: NoRemoteWorkPolicy },
  ],
})
export class AttendanceModule {}
