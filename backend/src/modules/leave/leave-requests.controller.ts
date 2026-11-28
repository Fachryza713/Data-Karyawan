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
  ApproveLeaveRequestDto,
  ListLeaveRequestsQueryDto,
  RejectLeaveRequestDto,
} from './dto/leave-request.dto.js';
import {
  HrLeaveRequestPageDto,
  LeaveRequestDetailResponseDto,
} from './dto/leave-response.dto.js';
import { LeaveReviewService } from './leave-review.service.js';
import { LeaveAuditActions } from './leave.constants.js';

const DECISION_RULES =
  'Hanya pengajuan PENDING; status final tidak bisa diubah (409, termasuk ' +
  'dua keputusan bersamaan). HR tidak bisa memproses pengajuannya sendiri (403).';

@ApiTags('Leave requests (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly reviews: LeaveReviewService) {}

  @Get()
  @ApiOperation({
    summary: 'Daftar pengajuan semua karyawan',
    description:
      'Filter status, kind, departmentId, dan from-to (pengajuan yang beririsan ' +
      'dengan rentang). Urut tanggal mulai terdekat.',
  })
  @ApiOkResponse({ type: HrLeaveRequestPageDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @Query() query: ListLeaveRequestsQueryDto,
  ): Promise<HrLeaveRequestPageDto> {
    return this.reviews.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detail pengajuan',
    description:
      'Termasuk presigned URL lampiran (berlaku 5 menit) dan saldo cuti tahun ' +
      'pengajuan untuk cuti tahunan.',
  })
  @ApiOkResponse({ type: LeaveRequestDetailResponseDto })
  @ApiBadRequestResponse({
    description: 'id bukan UUID',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeaveRequestDetailResponseDto> {
    return this.reviews.findOne(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Audit(LeaveAuditActions.approve)
  @ApiOperation({
    summary: 'Setujui pengajuan',
    description:
      `${DECISION_RULES} Satu transaksi: status, potong saldo cuti tahunan ` +
      '(409 "Saldo cuti tidak cukup"), presensi LEAVE/SICK/PERMIT per hari ' +
      'kerja untuk kind LEAVE, dan AuditLog. Hari kerja dihitung ulang.',
  })
  @ApiOkResponse({ type: LeaveRequestDetailResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Sudah diproses, atau saldo cuti tidak cukup',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Rentang tidak lagi berisi hari kerja',
    type: ErrorResponseDto,
  })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLeaveRequestDto,
  ): Promise<LeaveRequestDetailResponseDto> {
    return this.reviews.approve(id, user, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Audit(LeaveAuditActions.reject)
  @ApiOperation({
    summary: 'Tolak pengajuan (catatan wajib)',
    description: DECISION_RULES,
  })
  @ApiOkResponse({ type: LeaveRequestDetailResponseDto })
  @ApiBadRequestResponse({
    description: 'note kosong atau id bukan UUID',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Sudah diproses',
    type: ErrorResponseDto,
  })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLeaveRequestDto,
  ): Promise<LeaveRequestDetailResponseDto> {
    return this.reviews.reject(id, user, dto.note);
  }
}
