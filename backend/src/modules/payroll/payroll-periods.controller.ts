import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role } from '../../generated/prisma/enums.js';
import { Audit } from '../audit/audit.decorator.js';
import {
  CreatePayrollPeriodDto,
  ListPayrollPeriodsQueryDto,
  ReopenPayrollPeriodDto,
} from './dto/payroll-request.dto.js';
import {
  EmployerContributionReportDto,
  PayrollPeriodDetailResponseDto,
  PayrollPeriodResponseDto,
  PayrollRunResponseDto,
} from './dto/payroll-response.dto.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';
import { PayrollRunService } from './payroll-run.service.js';
import { PayrollAuditActions } from './payroll.constants.js';

@ApiTags('Payroll: periode (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('payroll-periods')
export class PayrollPeriodsController {
  constructor(
    private readonly periods: PayrollPeriodsService,
    private readonly runs: PayrollRunService,
  ) {}

  @Post()
  @Audit(PayrollAuditActions.periodCreate)
  @ApiOperation({
    summary: 'Buat periode payroll DRAFT (kosong)',
    description:
      'period YYYY-MM, unik, paling jauh bulan depan. Isi slip dengan ' +
      'POST /payroll-periods/:id/run.',
  })
  @ApiCreatedResponse({ type: PayrollPeriodResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Periode sudah dibuat',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  create(
    @Body() dto: CreatePayrollPeriodDto,
  ): Promise<PayrollPeriodResponseDto> {
    return this.periods.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Daftar periode payroll (terbaru dulu)' })
  @ApiOkResponse({ type: [PayrollPeriodResponseDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @Query() query: ListPayrollPeriodsQueryDto,
  ): Promise<PayrollPeriodResponseDto[]> {
    return this.periods.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail periode: semua slip dan total' })
  @ApiOkResponse({ type: PayrollPeriodDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayrollPeriodDetailResponseDto> {
    return this.periods.findOne(id);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  @Audit(PayrollAuditActions.periodRun)
  @ApiOperation({
    summary: 'Jalankan payroll (idempoten, hanya DRAFT)',
    description:
      'Satu transaksi dengan pg_advisory_xact_lock per periode; slip di-upsert ' +
      'per (periode, karyawan). Bonus, PPh 21, potongan lain, dan catatan yang ' +
      'sudah diisi HR dipertahankan. Dijalankan ulang (juga bersamaan) tidak ' +
      'menggandakan slip atau total. Tarif dari awal bulan, struktur gaji yang ' +
      'berlaku di akhir bulan.',
  })
  @ApiOkResponse({ type: PayrollRunResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Periode sudah FINAL/PAID',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Tarif belum lengkap atau tidak ada karyawan dengan gaji',
    type: ErrorResponseDto,
  })
  run(@Param('id', ParseUUIDPipe) id: string): Promise<PayrollRunResponseDto> {
    return this.runs.run(id);
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @Audit(PayrollAuditActions.periodFinalize)
  @ApiOperation({
    summary: 'DRAFT -> FINAL (slip terbit ke karyawan dan terkunci)',
    description: 'Butuh minimal satu slip dan tidak ada take home pay negatif.',
  })
  @ApiOkResponse({ type: PayrollPeriodDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Bukan DRAFT',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  finalize(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayrollPeriodDetailResponseDto> {
    return this.periods.finalize(id, user);
  }

  @Post(':id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @Audit(PayrollAuditActions.periodMarkPaid)
  @ApiOperation({ summary: 'FINAL -> PAID (tidak bisa dibuka lagi)' })
  @ApiOkResponse({ type: PayrollPeriodDetailResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Bukan FINAL',
    type: ErrorResponseDto,
  })
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayrollPeriodDetailResponseDto> {
    return this.periods.markPaid(id);
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @Audit(PayrollAuditActions.periodReopen)
  @ApiOperation({
    summary: 'FINAL -> DRAFT untuk koreksi (alasan wajib)',
    description:
      'Alasan dicatat di AuditLog. Periode PAID tidak bisa dibuka (409).',
  })
  @ApiOkResponse({ type: PayrollPeriodDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Bukan FINAL (termasuk PAID)',
    type: ErrorResponseDto,
  })
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenPayrollPeriodDto,
  ): Promise<PayrollPeriodDetailResponseDto> {
    return this.periods.reopen(id, dto.reason);
  }

  @Get(':id/employer-contributions')
  @ApiOperation({
    summary: 'Rekap iuran bagian perusahaan',
    description:
      'Per program (BPJS Kes, JHT, JP, JKK, JKM) dan per karyawan, dari ' +
      'snapshot slip. Tidak memotong slip karyawan.',
  })
  @ApiOkResponse({ type: EmployerContributionReportDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  employerContributions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EmployerContributionReportDto> {
    return this.periods.employerContributions(id);
  }
}
