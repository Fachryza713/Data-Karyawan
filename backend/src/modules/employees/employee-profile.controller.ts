import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Audit } from '../audit/audit.decorator.js';
import {
  ConfirmPhotoDto,
  PhotoUploadUrlDto,
  UpdateMyProfileDto,
} from './dto/employee-request.dto.js';
import {
  EmployeeResponseDto,
  PhotoUploadUrlResponseDto,
} from './dto/employee-response.dto.js';
import { EmployeeProfileService } from './employee-profile.service.js';
import {
  EmployeeAuditActions,
  EmployeeMessages,
} from './employees.constants.js';

/**
 * Data diri karyawan yang login, untuk semua role. ID selalu dari JWT.
 * Controller ini didaftarkan sebelum EmployeesController supaya
 * /employees/me tidak tertangkap route /employees/:id.
 */
@ApiTags('Employees (saya)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({
  description: EmployeeMessages.noEmployeeRecord,
  type: ErrorResponseDto,
})
@Controller('employees/me')
export class EmployeeProfileController {
  constructor(private readonly profile: EmployeeProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Data karyawan saya' })
  @ApiOkResponse({ type: EmployeeResponseDto })
  getMine(@CurrentUser() user: AuthUser): Promise<EmployeeResponseDto> {
    return this.profile.getMine(user.id);
  }

  @Patch()
  @Audit(EmployeeAuditActions.selfUpdate)
  @ApiOperation({
    summary: 'Ubah data diri',
    description:
      'Hanya fullName, phone, gender, birthDate. Field lain (departmentId, ' +
      'role, nip, email, ...) ditolak 400. Data organisasi diatur HR.',
  })
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  updateMine(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyProfileDto,
  ): Promise<EmployeeResponseDto> {
    return this.profile.updateMine(user.id, dto);
  }

  @Post('photo/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Minta presigned URL upload foto profil',
    description:
      'JPG/PNG maksimal 2 MB, dicek sebelum URL dibuat. Upload dengan POST ' +
      'multipart/form-data ke url: semua fields, lalu field "file" paling ' +
      'akhir. URL berlaku 5 menit. Setelah upload, konfirmasi dengan ' +
      'PATCH /employees/me/photo.',
  })
  @ApiOkResponse({ type: PhotoUploadUrlResponseDto })
  @ApiBadRequestResponse({
    description: 'Tipe bukan JPG/PNG atau ukuran lebih dari 2 MB',
    type: ErrorResponseDto,
  })
  createPhotoUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: PhotoUploadUrlDto,
  ): Promise<PhotoUploadUrlResponseDto> {
    return this.profile.createPhotoUpload(user.id, dto);
  }

  @Patch('photo')
  @Audit(EmployeeAuditActions.photoUpdate)
  @ApiOperation({
    summary: 'Konfirmasi foto profil yang sudah diunggah',
    description:
      'Key harus dari upload-url milik sendiri. Isi file dicek (harus JPG/PNG, ' +
      'maks 2 MB). Foto lama dihapus dari storage.',
  })
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  confirmPhoto(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmPhotoDto,
  ): Promise<EmployeeResponseDto> {
    return this.profile.confirmPhoto(user.id, dto.key);
  }
}
