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
  CreateShiftDto,
  ShiftResponseDto,
  UpdateShiftDto,
} from './dto/shift.dto.js';
import { SettingsAuditActions } from './settings.constants.js';
import { ShiftsService } from './shifts.service.js';

@ApiTags('Shifts (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar shift' })
  @ApiOkResponse({ type: [ShiftResponseDto] })
  list(): Promise<ShiftResponseDto[]> {
    return this.shifts.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail shift' })
  @ApiOkResponse({ type: ShiftResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ShiftResponseDto> {
    return this.shifts.findOne(id);
  }

  @Post()
  @Audit(SettingsAuditActions.shiftCreate)
  @ApiOperation({
    summary: 'Tambah shift',
    description:
      'Jam WIB format HH:mm, endTime harus setelah startTime (belum mendukung shift lintas tengah malam). lateToleranceMin 0-120 (default 15).',
  })
  @ApiCreatedResponse({ type: ShiftResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Nama sudah dipakai',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreateShiftDto): Promise<ShiftResponseDto> {
    return this.shifts.create(dto);
  }

  @Patch(':id')
  @Audit(SettingsAuditActions.shiftUpdate)
  @ApiOperation({
    summary: 'Ubah shift',
    description:
      'Field yang tidak dikirim tetap. Jam baru dicek terhadap jam lama, contoh mengirim endTime saja.',
  })
  @ApiOkResponse({ type: ShiftResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Nama sudah dipakai',
    type: ErrorResponseDto,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ): Promise<ShiftResponseDto> {
    return this.shifts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit(SettingsAuditActions.shiftDelete)
  @ApiOperation({
    summary: 'Hapus shift',
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
    return this.shifts.remove(id);
  }
}
