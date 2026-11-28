import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
  PayrollConfigQueryDto,
  UpdatePayrollConfigsDto,
} from './dto/payroll-request.dto.js';
import { PayrollConfigListResponseDto } from './dto/payroll-response.dto.js';
import { PayrollConfigService } from './payroll-config.service.js';
import { PayrollAuditActions } from './payroll.constants.js';

@ApiTags('Payroll: tarif BPJS (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('payroll-configs')
export class PayrollConfigsController {
  constructor(private readonly configs: PayrollConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'Tarif BPJS yang berlaku + riwayat',
    description:
      'current = tarif per program pada `date` (default hari ini WIB).',
  })
  @ApiOkResponse({ type: PayrollConfigListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @Query() query: PayrollConfigQueryDto,
  ): Promise<PayrollConfigListResponseDto> {
    return this.configs.list(query);
  }

  @Put()
  @Audit(PayrollAuditActions.configUpdate)
  @ApiOperation({
    summary: 'Tetapkan tarif baru mulai effectiveFrom',
    description:
      'Setiap program di body menjadi baris baru; tarif lama tidak ditimpa. ' +
      'effectiveFrom harus tanggal 1. Tarif pecahan ("0.0100" = 1%), wageCap ' +
      'teks rupiah atau null. JKK/JKM: employeeRate harus 0.',
  })
  @ApiOkResponse({ type: PayrollConfigListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Program + effectiveFrom yang sama sudah ada',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  update(
    @Body() dto: UpdatePayrollConfigsDto,
  ): Promise<PayrollConfigListResponseDto> {
    return this.configs.update(dto);
  }
}
