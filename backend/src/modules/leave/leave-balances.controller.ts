import { Controller, Get, Query } from '@nestjs/common';
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
import { LeaveBalanceQueryDto } from './dto/leave-request.dto.js';
import { LeaveBalanceResponseDto } from './dto/leave-response.dto.js';
import { LeaveBalanceService } from './leave-balance.service.js';

@ApiTags('Leave balances (saya)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.EMPLOYEE, Role.HR)
@Controller('leave-balances/me')
export class LeaveBalancesController {
  constructor(private readonly balances: LeaveBalanceService) {}

  @Get()
  @ApiOperation({
    summary: 'Saldo cuti tahunan saya',
    description:
      'Default tahun ini (WIB). remaining = quota - used; pendingDays = cuti ' +
      'tahunan yang masih menunggu persetujuan (belum memotong saldo).',
  })
  @ApiOkResponse({ type: LeaveBalanceResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({
    description: 'Akun belum punya data karyawan',
    type: ErrorResponseDto,
  })
  getMine(
    @CurrentUser() user: AuthUser,
    @Query() query: LeaveBalanceQueryDto,
  ): Promise<LeaveBalanceResponseDto> {
    return this.balances.getMine(user.id, query.year);
  }
}
