import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role } from '../../generated/prisma/enums.js';
import { CompensationService } from './compensation.service.js';
import {
  BenefitResponseDto,
  PayslipResponseDto,
  PayslipSummaryDto,
} from './dto/payroll-response.dto.js';
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

  @Get('benefits/me')
  @ApiOperation({ summary: 'BPJS dan asuransi saya' })
  @ApiOkResponse({ type: [BenefitResponseDto] })
  listMyBenefits(@CurrentUser() user: AuthUser): Promise<BenefitResponseDto[]> {
    return this.compensation.listMyBenefits(user.id);
  }
}
