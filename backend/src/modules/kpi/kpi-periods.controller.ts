import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role } from '../../generated/prisma/enums.js';
import { Audit } from '../audit/audit.decorator.js';
import {
  CreateKpiPeriodDto,
  ListKpiPeriodsQueryDto,
  UpdateKpiPeriodDto,
} from './dto/kpi-request.dto.js';
import {
  KpiActivationResponseDto,
  KpiPeriodProgressDto,
  KpiPeriodResponseDto,
} from './dto/kpi-response.dto.js';
import { KpiPeriodsService } from './kpi-periods.service.js';
import { KpiAuditActions } from './kpi.constants.js';

/** Periode KPI (kuartal). Hanya HR. */
@ApiTags('KPI: periode (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({
  description: 'Bukan HR (KPI hanya untuk HR)',
  type: ErrorResponseDto,
})
@Roles(Role.HR)
@Controller('kpi-periods')
export class KpiPeriodsController {
  constructor(private readonly periods: KpiPeriodsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar periode KPI (terbaru dulu)' })
  @ApiOkResponse({ type: [KpiPeriodResponseDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @Query() query: ListKpiPeriodsQueryDto,
  ): Promise<KpiPeriodResponseDto[]> {
    return this.periods.list(query);
  }

  @Post()
  @Audit(KpiAuditActions.periodCreate)
  @ApiOperation({
    summary: 'Buat periode KPI DRAFT',
    description:
      'Nama unik (mis. "Q1 2026"); endDate dan deadline tidak sebelum startDate.',
  })
  @ApiCreatedResponse({ type: KpiPeriodResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Nama sudah dipakai',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Urutan tanggal salah',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreateKpiPeriodDto): Promise<KpiPeriodResponseDto> {
    return this.periods.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail periode KPI' })
  @ApiOkResponse({ type: KpiPeriodResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KpiPeriodResponseDto> {
    return this.periods.findOne(id);
  }

  @Patch(':id')
  @Audit(KpiAuditActions.periodUpdate)
  @ApiOperation({
    summary: 'Ubah periode',
    description: 'DRAFT: semua field. ACTIVE: hanya deadline. CLOSED: 409.',
  })
  @ApiOkResponse({ type: KpiPeriodResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKpiPeriodDto,
  ): Promise<KpiPeriodResponseDto> {
    return this.periods.update(id, dto);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Audit(KpiAuditActions.periodActivate)
  @ApiOperation({
    summary: 'DRAFT -> ACTIVE: buat penilaian DRAFT untuk semua karyawan aktif',
    description:
      'Satu transaksi. Hanya satu periode ACTIVE. Ditolak 422 (details.positions) ' +
      'jika ada jabatan dengan karyawan aktif yang belum punya template valid ' +
      '(total bobot 100). Indikator dan bobot disalin ke penilaian (snapshot).',
  })
  @ApiOkResponse({ type: KpiActivationResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Bukan DRAFT atau ada periode lain yang aktif',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Jabatan tanpa template valid, atau tidak ada karyawan aktif',
    type: ErrorResponseDto,
  })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KpiActivationResponseDto> {
    return this.periods.activate(id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Audit(KpiAuditActions.periodClose)
  @ApiOperation({
    summary: 'ACTIVE -> CLOSED',
    description: 'Penilaian yang masih DRAFT ikut terkunci.',
  })
  @ApiOkResponse({ type: KpiPeriodResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'Bukan ACTIVE', type: ErrorResponseDto })
  close(@Param('id', ParseUUIDPipe) id: string): Promise<KpiPeriodResponseDto> {
    return this.periods.close(id);
  }

  @Get(':id/progress')
  @ApiOperation({
    summary: 'Progres penilaian periode',
    description:
      'Dinilai (FINAL) / total, rata-rata nilai akhir FINAL (1 desimal), dan tenggat.',
  })
  @ApiOkResponse({ type: KpiPeriodProgressDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  progress(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KpiPeriodProgressDto> {
    return this.periods.progress(id);
  }
}
