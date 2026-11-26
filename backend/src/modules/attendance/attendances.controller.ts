import { Readable } from 'node:stream';
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role } from '../../generated/prisma/enums.js';
import { AttendanceReportService } from './attendance-report.service.js';
import {
  AttendanceFilterQueryDto,
  AttendanceSummaryQueryDto,
  ListAttendancesQueryDto,
} from './dto/attendance-request.dto.js';
import {
  AttendanceLogPageDto,
  AttendanceSummaryResponseDto,
} from './dto/attendance-response.dto.js';

@ApiTags('Attendances (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('attendances')
export class AttendancesController {
  constructor(private readonly reports: AttendanceReportService) {}

  @Get()
  @ApiOperation({
    summary: 'Log presensi',
    description:
      'date (satu tanggal, termasuk karyawan NOT_YET) atau from-to (maks. 93 hari, ' +
      'hanya baris yang ada). Tanpa keduanya = hari ini WIB. Urut tanggal lalu nama.',
  })
  @ApiOkResponse({ type: AttendanceLogPageDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(@Query() query: ListAttendancesQueryDto): Promise<AttendanceLogPageDto> {
    return this.reports.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Jumlah karyawan per status untuk satu tanggal' })
  @ApiOkResponse({ type: AttendanceSummaryResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  summary(
    @Query() query: AttendanceSummaryQueryDto,
  ): Promise<AttendanceSummaryResponseDto> {
    return this.reports.summary(query.date);
  }

  @Get('export')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Ekspor log presensi (CSV)',
    description:
      'Filter sama dengan GET /attendances tanpa pagination. CSV UTF-8 (BOM) ' +
      'di-stream per batch; jam dalam WIB.',
  })
  @ApiOkResponse({
    description: 'File CSV',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  export(@Query() query: AttendanceFilterQueryDto): StreamableFile {
    const { filename, lines } = this.reports.exportCsv(query);
    return new StreamableFile(Readable.from(lines), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
