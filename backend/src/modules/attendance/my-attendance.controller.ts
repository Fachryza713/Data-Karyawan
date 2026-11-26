import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { AttendanceService } from './attendance.service.js';
import {
  ClockLocationDto,
  MyAttendanceQueryDto,
} from './dto/attendance-request.dto.js';
import {
  AttendanceResponseDto,
  MyMonthlyAttendanceResponseDto,
  TodayAttendanceResponseDto,
} from './dto/attendance-response.dto.js';

const LOCATION_RULES =
  'Waktu dan tanggal (WIB) dari server; jarak dihitung server. Ditolak 422 jika ' +
  'akurasi > 100 m, bukan hari kerja, atau di luar radius kantor tanpa izin ' +
  'WFH/dinas yang disetujui (details: { distanceM, radiusM }).';

@ApiTags('Attendances (karyawan)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.EMPLOYEE)
@Controller('attendances/me')
export class MyAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('clock-in')
  @ApiOperation({ summary: 'Absen masuk', description: LOCATION_RULES })
  @ApiCreatedResponse({ type: AttendanceResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({
    description: 'Akun belum punya data karyawan',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Sudah absen masuk (atau tercatat cuti/alpa) hari ini',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  clockIn(
    @CurrentUser() user: AuthUser,
    @Body() dto: ClockLocationDto,
  ): Promise<AttendanceResponseDto> {
    return this.attendance.clockIn(user.id, dto);
  }

  @Post('clock-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Absen pulang',
    description: `${LOCATION_RULES} Pulang sebelum jam pulang shift = EARLY_LEAVE.`,
  })
  @ApiOkResponse({ type: AttendanceResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Sudah absen pulang hari ini',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Belum absen masuk, atau aturan lokasi/akurasi/hari kerja',
    type: ErrorResponseDto,
  })
  clockOut(
    @CurrentUser() user: AuthUser,
    @Body() dto: ClockLocationDto,
  ): Promise<AttendanceResponseDto> {
    return this.attendance.clockOut(user.id, dto);
  }

  @Get('today')
  @ApiOperation({ summary: 'Absen hari ini beserta shift dan kantor' })
  @ApiOkResponse({ type: TodayAttendanceResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  today(@CurrentUser() user: AuthUser): Promise<TodayAttendanceResponseDto> {
    return this.attendance.today(user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Riwayat absen sebulan + ringkasan',
    description:
      'Ringkasan: hadir, terlambat, pulang cepat, cuti, sakit, izin, alpa.',
  })
  @ApiOkResponse({ type: MyMonthlyAttendanceResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  myMonth(
    @CurrentUser() user: AuthUser,
    @Query() query: MyAttendanceQueryDto,
  ): Promise<MyMonthlyAttendanceResponseDto> {
    return this.attendance.myMonth(user.id, query.month);
  }
}
