import { Module } from '@nestjs/common';
import { Clock } from '../../common/time/clock.js';
import { KpiPeriodsController } from './kpi-periods.controller.js';
import { KpiPeriodsService } from './kpi-periods.service.js';
import { KpiReviewsController } from './kpi-reviews.controller.js';
import { KpiReviewsService } from './kpi-reviews.service.js';
import { KpiTemplatesController } from './kpi-templates.controller.js';
import { KpiTemplatesService } from './kpi-templates.service.js';

/**
 * KPI (PRD 5.6, 6.5): template per jabatan, periode kuartal, penilaian dan
 * skor. Semua endpoint @Roles(HR); karyawan tidak punya endpoint KPI sama
 * sekali, termasuk untuk penilaian miliknya sendiri.
 */
@Module({
  controllers: [
    KpiTemplatesController,
    KpiPeriodsController,
    KpiReviewsController,
  ],
  providers: [KpiTemplatesService, KpiPeriodsService, KpiReviewsService, Clock],
})
export class KpiModule {}
