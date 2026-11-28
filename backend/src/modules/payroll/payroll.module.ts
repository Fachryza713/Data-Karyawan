import { Module } from '@nestjs/common';
import { Clock } from '../../common/time/clock.js';
import { CompensationService } from './compensation.service.js';
import { EmployeeCompensationController } from './employee-compensation.controller.js';
import { MyPayrollController } from './my-payroll.controller.js';
import { PayrollConfigService } from './payroll-config.service.js';
import { PayrollConfigsController } from './payroll-configs.controller.js';
import { PayrollItemsController } from './payroll-items.controller.js';
import { PayrollItemsService } from './payroll-items.service.js';
import { PayrollPeriodsController } from './payroll-periods.controller.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';
import { PayrollRunService } from './payroll-run.service.js';
import { PayslipPdfController } from './payslip-pdf.controller.js';
import { PayslipPdfQueue } from './payslip-pdf.queue.js';
import { PayslipPdfService } from './payslip-pdf.service.js';
import { PayslipsService } from './payslips.service.js';

/**
 * Payroll bulanan (PRD 5.5, 6.4): struktur gaji dan manfaat karyawan, tarif
 * BPJS per tanggal berlaku, periode DRAFT/FINAL/PAID dengan slip snapshot,
 * serta slip dan manfaat untuk karyawan (/me).
 *
 * PDF slip: API hanya memasukkan job ke queue "payslip-pdf" (butuh
 * QueueModule); PDF dibuat PayslipPdfProcessor di proses worker (WorkerModule).
 */
@Module({
  controllers: [
    MyPayrollController,
    EmployeeCompensationController,
    PayrollConfigsController,
    PayrollPeriodsController,
    PayrollItemsController,
    PayslipPdfController,
  ],
  providers: [
    CompensationService,
    PayrollConfigService,
    PayrollRunService,
    PayrollPeriodsService,
    PayrollItemsService,
    PayslipsService,
    PayslipPdfService,
    PayslipPdfQueue,
    Clock,
  ],
})
export class PayrollModule {}
