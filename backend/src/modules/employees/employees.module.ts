import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LeaveModule } from '../leave/leave.module.js';
import { EmployeeInvitationService } from './employee-invitation.service.js';
import { EmployeeProfileController } from './employee-profile.controller.js';
import { EmployeeProfileService } from './employee-profile.service.js';
import { EmployeeSerializer } from './employee.serializer.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({
  imports: [AuthModule, LeaveModule],
  // Urutan penting: /employees/me harus terdaftar sebelum /employees/:id.
  controllers: [EmployeeProfileController, EmployeesController],
  providers: [
    EmployeesService,
    EmployeeProfileService,
    EmployeeSerializer,
    EmployeeInvitationService,
  ],
})
export class EmployeesModule {}
