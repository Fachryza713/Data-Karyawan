import { Module } from '@nestjs/common';
import { CompanySettingsController } from './company-settings.controller.js';
import { CompanySettingsService } from './company-settings.service.js';
import { HolidayService } from './holiday.service.js';
import { HolidaysController } from './holidays.controller.js';
import { OfficeLocationsController } from './office-locations.controller.js';
import { OfficeLocationsService } from './office-locations.service.js';
import { ShiftsController } from './shifts.controller.js';
import { ShiftsService } from './shifts.service.js';

/**
 * Pengaturan HR: lokasi kantor, shift, hari libur, dan kontak bantuan.
 * HolidayService diekspor untuk modul absensi, cuti, dan payroll
 * (isWorkingDay, workingDaysBetween).
 */
@Module({
  controllers: [
    OfficeLocationsController,
    ShiftsController,
    HolidaysController,
    CompanySettingsController,
  ],
  providers: [
    OfficeLocationsService,
    ShiftsService,
    HolidayService,
    CompanySettingsService,
  ],
  exports: [HolidayService],
})
export class SettingsModule {}
