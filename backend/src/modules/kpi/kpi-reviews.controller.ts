import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
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
  ListKpiReviewsQueryDto,
  SaveKpiScoresDto,
} from './dto/kpi-request.dto.js';
import {
  KpiReviewDetailDto,
  KpiReviewListResponseDto,
} from './dto/kpi-response.dto.js';
import { KpiReviewsService } from './kpi-reviews.service.js';
import { KpiAuditActions } from './kpi.constants.js';

/** Penilaian KPI. Hanya HR; hasil tidak pernah terlihat oleh karyawan. */
@ApiTags('KPI: penilaian (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({
  description: 'Bukan HR, atau HR menilai KPI dirinya sendiri',
  type: ErrorResponseDto,
})
@Roles(Role.HR)
@Controller('kpi-reviews')
export class KpiReviewsController {
  constructor(private readonly reviews: KpiReviewsService) {}

  @Get()
  @ApiOperation({
    summary: 'Daftar penilaian KPI',
    description:
      'Filter periode, departemen (saat aktivasi), dan status; dengan pagination.',
  })
  @ApiOkResponse({ type: KpiReviewListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @Query() query: ListKpiReviewsQueryDto,
  ): Promise<KpiReviewListResponseDto> {
    return this.reviews.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detail penilaian: indikator snapshot, skor, dan perkiraan nilai',
  })
  @ApiOkResponse({ type: KpiReviewDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<KpiReviewDetailDto> {
    return this.reviews.findOne(id);
  }

  @Put(':id/scores')
  @ApiOperation({
    summary: 'Simpan skor (menimpa) penilaian DRAFT',
    description:
      'Hanya review DRAFT di periode ACTIVE. Tepat satu skor 0-100 (teks, ' +
      'maks 2 desimal) untuk setiap indikator; catatan yang tidak dikirim dikosongkan.',
  })
  @ApiOkResponse({ type: KpiReviewDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Sudah FINAL atau periode tidak aktif',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Indikator terlewat, asing, atau ganda (details)',
    type: ErrorResponseDto,
  })
  saveScores(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveKpiScoresDto,
  ): Promise<KpiReviewDetailDto> {
    return this.reviews.saveScores(id, dto, user);
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @Audit(KpiAuditActions.reviewFinalize)
  @ApiOperation({
    summary: 'DRAFT -> FINAL: hitung nilai akhir dan grade, kunci skor',
    description:
      'Nilai akhir = jumlah(skor x bobot / 100), dibulatkan 1 desimal. Grade ' +
      'A 85-100, B 70-84, C 55-69, D < 55. Semua skor wajib terisi.',
  })
  @ApiOkResponse({ type: KpiReviewDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Sudah FINAL atau periode tidak aktif',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Masih ada skor kosong',
    type: ErrorResponseDto,
  })
  finalize(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KpiReviewDetailDto> {
    return this.reviews.finalize(id, user);
  }
}
