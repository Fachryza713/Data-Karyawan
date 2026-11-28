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
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
  CopyKpiTemplateDto,
  CreateKpiIndicatorDto,
  CreateKpiTemplateDto,
  ListKpiTemplatesQueryDto,
  UpdateKpiIndicatorDto,
  UpdateKpiTemplateDto,
} from './dto/kpi-request.dto.js';
import {
  KpiIndicatorResponseDto,
  KpiTemplateResponseDto,
} from './dto/kpi-response.dto.js';
import { KpiTemplatesService } from './kpi-templates.service.js';
import { KpiAuditActions } from './kpi.constants.js';

/** Template KPI per jabatan. Hanya HR (karyawan 403, PRD 6.5). */
@ApiTags('KPI: template (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({
  description: 'Bukan HR (KPI hanya untuk HR)',
  type: ErrorResponseDto,
})
@Roles(Role.HR)
@Controller('kpi-templates')
export class KpiTemplatesController {
  constructor(private readonly templates: KpiTemplatesService) {}

  @Get()
  @ApiOperation({
    summary: 'Daftar template KPI',
    description:
      'Beserta indikator, total bobot, dan status valid (total = 100).',
  })
  @ApiOkResponse({ type: [KpiTemplateResponseDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @Query() query: ListKpiTemplatesQueryDto,
  ): Promise<KpiTemplateResponseDto[]> {
    return this.templates.list(query);
  }

  @Post()
  @Audit(KpiAuditActions.templateCreate)
  @ApiOperation({
    summary: 'Buat template KPI untuk satu jabatan',
    description:
      'isActive default true: template aktif lain di jabatan yang sama ' +
      'dinonaktifkan. Indikator boleh dikirim sekaligus atau ditambah kemudian.',
  })
  @ApiCreatedResponse({ type: KpiTemplateResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({
    description: 'Jabatan tidak ada',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Nama indikator ganda atau bentrok template aktif',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Bobot 0',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreateKpiTemplateDto): Promise<KpiTemplateResponseDto> {
    return this.templates.create(dto);
  }

  @Post('copy')
  @Audit(KpiAuditActions.templateCopy)
  @ApiOperation({
    summary: 'Salin template aktif dari jabatan lain',
    description:
      'Indikator, bobot, target, dan urutan disalin menjadi template aktif ' +
      'baru jabatan tujuan (template aktif lamanya dinonaktifkan).',
  })
  @ApiCreatedResponse({ type: KpiTemplateResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({
    description: 'Jabatan tidak ada',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Jabatan sama, atau jabatan sumber tanpa template aktif',
    type: ErrorResponseDto,
  })
  copy(@Body() dto: CopyKpiTemplateDto): Promise<KpiTemplateResponseDto> {
    return this.templates.copy(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail template KPI' })
  @ApiOkResponse({ type: KpiTemplateResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KpiTemplateResponseDto> {
    return this.templates.findOne(id);
  }

  @Patch(':id')
  @Audit(KpiAuditActions.templateUpdate)
  @ApiOperation({
    summary: 'Ubah nama atau status aktif template',
    description:
      'isActive true menonaktifkan template aktif lain di jabatan yang sama. ' +
      'Penilaian yang sudah dibuat memakai snapshot dan tidak berubah.',
  })
  @ApiOkResponse({ type: KpiTemplateResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKpiTemplateDto,
  ): Promise<KpiTemplateResponseDto> {
    return this.templates.update(id, dto);
  }

  @Post(':id/indicators')
  @Audit(KpiAuditActions.indicatorCreate)
  @ApiOperation({
    summary: 'Tambah indikator',
    description: `Bobot > 0 sebagai teks ("33.33"). Maksimal 20 indikator, nama unik per template.`,
  })
  @ApiCreatedResponse({ type: KpiIndicatorResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Nama indikator ganda',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Bobot 0 atau sudah 20 indikator',
    type: ErrorResponseDto,
  })
  addIndicator(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateKpiIndicatorDto,
  ): Promise<KpiIndicatorResponseDto> {
    return this.templates.addIndicator(id, dto);
  }

  @Patch(':id/indicators/:indicatorId')
  @Audit(KpiAuditActions.indicatorUpdate)
  @ApiOperation({ summary: 'Ubah indikator' })
  @ApiOkResponse({ type: KpiIndicatorResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Nama indikator ganda',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Bobot 0',
    type: ErrorResponseDto,
  })
  updateIndicator(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('indicatorId', ParseUUIDPipe) indicatorId: string,
    @Body() dto: UpdateKpiIndicatorDto,
  ): Promise<KpiIndicatorResponseDto> {
    return this.templates.updateIndicator(id, indicatorId, dto);
  }

  @Delete(':id/indicators/:indicatorId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit(KpiAuditActions.indicatorDelete)
  @ApiOperation({
    summary: 'Hapus indikator',
    description:
      'Penilaian yang sudah dibuat tetap memakai snapshot indikator ini.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  removeIndicator(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('indicatorId', ParseUUIDPipe) indicatorId: string,
  ): Promise<void> {
    return this.templates.removeIndicator(id, indicatorId);
  }
}
