import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role, SlipStatus } from '../../generated/prisma/enums.js';
import { CompensationService } from './compensation.service.js';
import {
  BenefitResponseDto,
  PayslipResponseDto,
  PayslipSummaryDto,
} from './dto/payroll-response.dto.js';
import {
  PayslipPdfPendingDto,
  PayslipPdfUrlDto,
} from './dto/payslip-pdf.dto.js';
import {
  PAYSLIP_PDF_RETRY_AFTER_SECONDS,
  PAYSLIP_PDF_URL_TTL_SECONDS,
} from './payroll.constants.js';
import { PayslipsService } from './payslips.service.js';

/** Slip gaji dan manfaat milik akun yang login. ID selalu dari JWT. */
@ApiTags('Payroll (saya)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({
  description:
    'Akun belum punya data karyawan, atau slip tidak ada/belum terbit',
  type: ErrorResponseDto,
})
@Roles(Role.EMPLOYEE, Role.HR)
@Controller()
export class MyPayrollController {
  constructor(
    private readonly payslips: PayslipsService,
    private readonly compensation: CompensationService,
  ) {}

  @Get('payslips/me')
  @ApiOperation({
    summary: 'Daftar slip gaji saya',
    description: 'Hanya periode FINAL/PAID; periode DRAFT belum terbit.',
  })
  @ApiOkResponse({ type: [PayslipSummaryDto] })
  listMine(@CurrentUser() user: AuthUser): Promise<PayslipSummaryDto[]> {
    return this.payslips.listMine(user.id);
  }

  @Get('payslips/me/:periodId')
  @ApiOperation({
    summary: 'Slip gaji saya untuk satu periode',
    description:
      'Dari snapshot saat payroll dijalankan (tidak dihitung ulang). Periode ' +
      'DRAFT atau tanpa slip milik saya = 404.',
  })
  @ApiOkResponse({ type: PayslipResponseDto })
  @ApiBadRequestResponse({
    description: 'periodId bukan UUID',
    type: ErrorResponseDto,
  })
  findMine(
    @CurrentUser() user: AuthUser,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ): Promise<PayslipResponseDto> {
    return this.payslips.findMine(user.id, periodId);
  }

  @Get('payslips/me/:periodId/pdf')
  @ApiOperation({
    summary: 'Link PDF slip gaji saya',
    description:
      'PDF dibuat worker setelah payroll FINAL. 200 = presigned URL ' +
      `(berlaku ${PAYSLIP_PDF_URL_TTL_SECONDS / 60} menit), 202 = masih dibuat ` +
      '(coba lagi setelah header Retry-After detik), 409 = gagal dibuat atau ' +
      'belum diminta (HR perlu membuat ulang). Periode DRAFT atau slip orang ' +
      'lain = 404.',
  })
  @ApiOkResponse({ type: PayslipPdfUrlDto })
  @ApiAcceptedResponse({ type: PayslipPdfPendingDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiBadRequestResponse({
    description: 'periodId bukan UUID',
    type: ErrorResponseDto,
  })
  async myPdf(
    @CurrentUser() user: AuthUser,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PayslipPdfUrlDto | PayslipPdfPendingDto> {
    const result = await this.payslips.myPdf(user.id, periodId);
    if (result.status === SlipStatus.QUEUED) {
      res
        .status(HttpStatus.ACCEPTED)
        .setHeader('Retry-After', String(PAYSLIP_PDF_RETRY_AFTER_SECONDS));
    }
    return result;
  }

  @Get('benefits/me')
  @ApiOperation({ summary: 'BPJS dan asuransi saya' })
  @ApiOkResponse({ type: [BenefitResponseDto] })
  listMyBenefits(@CurrentUser() user: AuthUser): Promise<BenefitResponseDto[]> {
    return this.compensation.listMyBenefits(user.id);
  }
}
