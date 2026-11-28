import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
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
import { UpdatePayrollItemDto } from './dto/payroll-request.dto.js';
import { PayrollItemResponseDto } from './dto/payroll-response.dto.js';
import { PayrollItemsService } from './payroll-items.service.js';
import { PayrollAuditActions } from './payroll.constants.js';

@ApiTags('Payroll: periode (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('payroll-items')
export class PayrollItemsController {
  constructor(private readonly items: PayrollItemsService) {}

  @Patch(':id')
  @Audit(PayrollAuditActions.itemUpdate)
  @ApiOperation({
    summary: 'Isi bonus, PPh 21, potongan lain, catatan (hanya DRAFT)',
    description:
      'Uang berupa teks. Bruto dan take home pay dihitung ulang; take home pay ' +
      'negatif ditolak 422. note null = dikosongkan. Nilai ini dipertahankan ' +
      'saat payroll dijalankan ulang.',
  })
  @ApiOkResponse({ type: PayrollItemResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Periode sudah FINAL/PAID',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollItemDto,
  ): Promise<PayrollItemResponseDto> {
    return this.items.update(id, dto);
  }
}
