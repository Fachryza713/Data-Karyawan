import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role } from '../../generated/prisma/enums.js';
import { Audit } from '../audit/audit.decorator.js';
import { CompensationService } from './compensation.service.js';
import {
  CreateBenefitDto,
  CreateSalaryStructureDto,
  UpdateBenefitDto,
} from './dto/payroll-request.dto.js';
import {
  BenefitResponseDto,
  SalaryStructureResponseDto,
} from './dto/payroll-response.dto.js';
import { PayrollAuditActions } from './payroll.constants.js';

@ApiTags('Payroll: gaji dan manfaat karyawan (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({
  description: 'Karyawan atau data manfaat tidak ditemukan',
  type: ErrorResponseDto,
})
@ApiBadRequestResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('employees/:employeeId')
export class EmployeeCompensationController {
  constructor(private readonly compensation: CompensationService) {}

  @Post('salary-structures')
  @Audit(PayrollAuditActions.salaryCreate)
  @ApiOperation({
    summary: 'Tambah struktur gaji (kenaikan gaji = baris baru)',
    description:
      'Uang berupa teks, contoh "8500000". Baris lama tidak pernah diubah; ' +
      'payroll memakai struktur dengan effectiveFrom terbaru <= akhir bulan. ' +
      'Slip yang sudah FINAL/PAID tidak berubah (snapshot).',
  })
  @ApiCreatedResponse({ type: SalaryStructureResponseDto })
  createSalaryStructure(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateSalaryStructureDto,
  ): Promise<SalaryStructureResponseDto> {
    return this.compensation.createSalaryStructure(employeeId, dto);
  }

  @Get('salary-structures')
  @ApiOperation({
    summary: 'Riwayat struktur gaji',
    description: 'Terbaru dulu; isCurrent menandai yang berlaku hari ini.',
  })
  @ApiOkResponse({ type: [SalaryStructureResponseDto] })
  listSalaryStructures(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<SalaryStructureResponseDto[]> {
    return this.compensation.listSalaryStructures(employeeId);
  }

  @Get('benefits')
  @ApiOperation({ summary: 'Daftar BPJS dan asuransi karyawan' })
  @ApiOkResponse({ type: [BenefitResponseDto] })
  listBenefits(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<BenefitResponseDto[]> {
    return this.compensation.listBenefits(employeeId);
  }

  @Post('benefits')
  @Audit(PayrollAuditActions.benefitCreate)
  @ApiOperation({ summary: 'Tambah data BPJS/asuransi' })
  @ApiCreatedResponse({ type: BenefitResponseDto })
  createBenefit(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateBenefitDto,
  ): Promise<BenefitResponseDto> {
    return this.compensation.createBenefit(employeeId, dto);
  }

  @Patch('benefits/:benefitId')
  @Audit(PayrollAuditActions.benefitUpdate)
  @ApiOperation({
    summary: 'Ubah data BPJS/asuransi',
    description:
      'Hanya field yang dikirim; program/cardNo/class null = dikosongkan.',
  })
  @ApiOkResponse({ type: BenefitResponseDto })
  updateBenefit(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('benefitId', ParseUUIDPipe) benefitId: string,
    @Body() dto: UpdateBenefitDto,
  ): Promise<BenefitResponseDto> {
    return this.compensation.updateBenefit(employeeId, benefitId, dto);
  }

  @Delete('benefits/:benefitId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit(PayrollAuditActions.benefitDelete)
  @ApiOperation({
    summary: 'Hapus data BPJS/asuransi (isi lama dicatat di AuditLog)',
  })
  @ApiNoContentResponse()
  removeBenefit(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('benefitId', ParseUUIDPipe) benefitId: string,
  ): Promise<void> {
    return this.compensation.removeBenefit(employeeId, benefitId);
  }
}
