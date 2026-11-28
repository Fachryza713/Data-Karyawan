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
  AttachmentUploadUrlDto,
  CreateLeaveRequestDto,
  ListMyLeaveRequestsQueryDto,
} from './dto/leave-request.dto.js';
import {
  AttachmentUploadUrlResponseDto,
  LeaveRequestResponseDto,
  MyLeaveRequestPageDto,
} from './dto/leave-response.dto.js';
import { LeaveRequestsService } from './leave-requests.service.js';
import { LeaveAuditActions } from './leave.constants.js';

const SUBMIT_RULES =
  'Aturan: startDate <= endDate; tidak tumpang tindih dengan pengajuan ' +
  'PENDING/APPROVED milik sendiri (409); cuti tahunan tidak melebihi sisa ' +
  'kuota (quota - used) dan tidak lintas tahun; sakit lebih dari 1 hari kerja ' +
  'wajib attachmentKey; WFH/dinas paling lambat H-1 (mulai minimal besok WIB); ' +
  'destination wajib untuk BUSINESS_TRIP; cuti mulai paling lama 7 hari ke ' +
  'belakang; selesai paling jauh 365 hari. workingDays dihitung server.';

/**
 * Pengajuan milik akun yang login (karyawan dan HR). ID selalu dari JWT.
 * Didaftarkan sebelum LeaveRequestsController supaya /leave-requests/me
 * tidak tertangkap route /leave-requests/:id.
 */
@ApiTags('Leave requests (saya)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({
  description: 'Akun belum punya data karyawan, atau pengajuan tidak ditemukan',
  type: ErrorResponseDto,
})
@Roles(Role.EMPLOYEE, Role.HR)
@Controller('leave-requests/me')
export class MyLeaveRequestsController {
  constructor(private readonly requests: LeaveRequestsService) {}

  @Post()
  @Audit(LeaveAuditActions.submit)
  @ApiOperation({
    summary: 'Ajukan cuti, sakit, izin khusus, WFH, atau dinas luar',
    description: SUBMIT_RULES,
  })
  @ApiCreatedResponse({ type: LeaveRequestResponseDto })
  @ApiBadRequestResponse({
    description:
      'Input tidak valid, field di luar kind-nya, atau lampiran tidak valid',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Tumpang tindih dengan pengajuan lain (details.requestId)',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Melanggar aturan H-1, kuota, lampiran, atau tanpa hari kerja',
    type: ErrorResponseDto,
  })
  submit(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLeaveRequestDto,
  ): Promise<LeaveRequestResponseDto> {
    return this.requests.submit(user.id, dto);
  }

  @Post('attachments/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Minta presigned URL upload lampiran',
    description:
      'JPG/PNG/PDF maksimal 2 MB, dicek sebelum URL dibuat. Upload dengan POST ' +
      'multipart/form-data ke url: semua fields, lalu field "file" paling ' +
      'akhir. URL berlaku 5 menit. Kirim key sebagai attachmentKey saat ' +
      'POST /leave-requests/me; server mengecek key milik Anda dan file-nya ada.',
  })
  @ApiOkResponse({ type: AttachmentUploadUrlResponseDto })
  @ApiBadRequestResponse({
    description: 'Tipe bukan JPG/PNG/PDF atau ukuran lebih dari 2 MB',
    type: ErrorResponseDto,
  })
  createAttachmentUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: AttachmentUploadUrlDto,
  ): Promise<AttachmentUploadUrlResponseDto> {
    return this.requests.createAttachmentUpload(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Riwayat pengajuan saya',
    description: 'Urut tanggal mulai terbaru. Filter status dan kind opsional.',
  })
  @ApiOkResponse({ type: MyLeaveRequestPageDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listMine(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMyLeaveRequestsQueryDto,
  ): Promise<MyLeaveRequestPageDto> {
    return this.requests.listMine(user.id, query);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Audit(LeaveAuditActions.cancel)
  @ApiOperation({
    summary: 'Batalkan pengajuan saya yang masih PENDING',
    description:
      'Pengajuan orang lain = 404. Status final (APPROVED/REJECTED/CANCELLED) = 409.',
  })
  @ApiOkResponse({ type: LeaveRequestResponseDto })
  @ApiBadRequestResponse({
    description: 'id bukan UUID',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Pengajuan sudah diproses',
    type: ErrorResponseDto,
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeaveRequestResponseDto> {
    return this.requests.cancel(user.id, id);
  }
}
