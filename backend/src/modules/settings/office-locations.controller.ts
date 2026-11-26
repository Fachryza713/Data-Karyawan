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
  ApiConflictResponse,
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
import {
  CreateOfficeLocationDto,
  OfficeLocationResponseDto,
  UpdateOfficeLocationDto,
} from './dto/office-location.dto.js';
import { OfficeLocationsService } from './office-locations.service.js';
import { SettingsAuditActions } from './settings.constants.js';

@ApiTags('Office locations (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('office-locations')
export class OfficeLocationsController {
  constructor(private readonly locations: OfficeLocationsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar lokasi kantor' })
  @ApiOkResponse({ type: [OfficeLocationResponseDto] })
  list(): Promise<OfficeLocationResponseDto[]> {
    return this.locations.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail lokasi kantor' })
  @ApiOkResponse({ type: OfficeLocationResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfficeLocationResponseDto> {
    return this.locations.findOne(id);
  }

  @Post()
  @Audit(SettingsAuditActions.officeLocationCreate)
  @ApiOperation({
    summary: 'Tambah lokasi kantor',
    description:
      'Titik kantor untuk validasi jarak presensi GPS. radiusM 25-1000 meter (default 100).',
  })
  @ApiCreatedResponse({ type: OfficeLocationResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Nama sudah dipakai',
    type: ErrorResponseDto,
  })
  create(
    @Body() dto: CreateOfficeLocationDto,
  ): Promise<OfficeLocationResponseDto> {
    return this.locations.create(dto);
  }

  @Patch(':id')
  @Audit(SettingsAuditActions.officeLocationUpdate)
  @ApiOperation({ summary: 'Ubah lokasi kantor' })
  @ApiOkResponse({ type: OfficeLocationResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Nama sudah dipakai',
    type: ErrorResponseDto,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfficeLocationDto,
  ): Promise<OfficeLocationResponseDto> {
    return this.locations.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit(SettingsAuditActions.officeLocationDelete)
  @ApiOperation({
    summary: 'Hapus lokasi kantor',
    description:
      'Ditolak 409 jika masih dipakai karyawan (termasuk nonaktif); jumlahnya ada di details.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Masih dipakai. details: { employeeCount }',
    type: ErrorResponseDto,
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.locations.remove(id);
  }
}
