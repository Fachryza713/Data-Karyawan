import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role } from '../../generated/prisma/enums.js';
import { LeaveTypeResponseDto } from './dto/leave-response.dto.js';
import { LeaveRequestsService } from './leave-requests.service.js';

@ApiTags('Leave types')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.EMPLOYEE, Role.HR)
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly requests: LeaveRequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'Jenis cuti',
    description:
      'Sumber leaveTypeId untuk POST /leave-requests/me (kind LEAVE).',
  })
  @ApiOkResponse({ type: [LeaveTypeResponseDto] })
  list(): Promise<LeaveTypeResponseDto[]> {
    return this.requests.listLeaveTypes();
  }
}
