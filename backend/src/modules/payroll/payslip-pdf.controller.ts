import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role } from '../../generated/prisma/enums.js';
import { Audit } from '../audit/audit.decorator.js';
import {
  PayslipGenerationStatusDto,
  RegeneratePayslipsDto,
  RegeneratePayslipsResponseDto,
} from './dto/payslip-pdf.dto.js';
import { PayrollAuditActions } from './payroll.constants.js';
import { PayslipPdfService } from './payslip-pdf.service.js';

/** Pembuatan PDF slip per periode (queue "payslip-pdf", dikerjakan worker). */
@ApiTags('Payroll: PDF slip (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({
  description: 'Periode tidak ditemukan',
  type: ErrorResponseDto,
})
@Roles(Role.HR)
@Controller('payroll-periods')
export class PayslipPdfController {
  constructor(private readonly payslipPdf: PayslipPdfService) {}

  @Post(':id/payslips/regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit(PayrollAuditActions.payslipsRegenerate)
  @ApiOperation({
    summary: 'Buat ulang PDF slip (FAILED atau semua)',
    description:
      'Hanya periode FINAL/PAID. Slip yang dipilih menjadi QUEUED lalu ' +
      'dimasukkan ke antrean (jobId = itemId, tidak ganda). Response tidak ' +
      'menunggu PDF; pantau lewat GET .../payslips/status.',
  })
  @ApiAcceptedResponse({ type: RegeneratePayslipsResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Periode masih DRAFT',
    type: ErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Redis/antrean tidak tersedia; slip ditandai FAILED',
    type: ErrorResponseDto,
  })
  regenerate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegeneratePayslipsDto,
  ): Promise<RegeneratePayslipsResponseDto> {
    return this.payslipPdf.regenerate(id, dto.scope);
  }

  @Get(':id/payslips/status')
  @ApiOperation({
    summary: 'Status pembuatan PDF slip per periode',
    description:
      'Jumlah slip per slipStatus (NONE, QUEUED, READY, FAILED) dan daftar ' +
      'slip FAILED beserta alasannya.',
  })
  @ApiOkResponse({ type: PayslipGenerationStatusDto })
  @ApiBadRequestResponse({
    description: 'id bukan UUID',
    type: ErrorResponseDto,
  })
  status(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PayslipGenerationStatusDto> {
    return this.payslipPdf.status(id);
  }
}
