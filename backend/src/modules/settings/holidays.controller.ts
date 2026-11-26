import {
  Body,
  Controller,
  Delete,
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
  CreateHolidayDto,
  HolidayResponseDto,
  ListHolidaysQueryDto,
} from './dto/holiday.dto.js';
import { HolidayService } from './holiday.service.js';
import { SettingsAuditActions } from './settings.constants.js';

@ApiTags('Holidays')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidays: HolidayService) {}

  @Get()
  @ApiOperation({
    summary: 'Daftar hari libur (semua role)',
    description: 'Urut tanggal. Filter ?year=2026 untuk satu tahun.',
  })
  @ApiOkResponse({ type: [HolidayResponseDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(@Query() query: ListHolidaysQueryDto): Promise<HolidayResponseDto[]> {
    return this.holidays.list(query);
  }

  @Post()
  @Roles(Role.HR)
  @Audit(SettingsAuditActions.holidayCreate)
  @ApiOperation({ summary: 'Tambah hari libur (HR)' })
  @ApiCreatedResponse({ type: HolidayResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Tanggal sudah terdaftar. details: { holidayId }',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreateHolidayDto): Promise<HolidayResponseDto> {
    return this.holidays.create(dto);
  }

  @Delete(':id')
  @Roles(Role.HR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit(SettingsAuditActions.holidayDelete)
  @ApiOperation({ summary: 'Hapus hari libur (HR)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.holidays.remove(id);
  }
}
