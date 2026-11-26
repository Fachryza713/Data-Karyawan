import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';
import { PositionsController } from './positions.controller.js';
import { PositionsService } from './positions.service.js';

/** Master data organisasi: departemen dan jabatan. */
@Module({
  controllers: [DepartmentsController, PositionsController],
  providers: [DepartmentsService, PositionsService],
})
export class OrganizationModule {}
