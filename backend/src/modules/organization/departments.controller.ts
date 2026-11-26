import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { DepartmentsService } from './departments.service.js';
import {
  CreateDepartmentDto,
  DepartmentResponseDto,
  UpdateDepartmentDto,
} from './dto/organization.dto.js';
import { OrganizationAuditActions } from './organization.constants.js';

@ApiTags('Departments (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar departemen' })
  @ApiOkResponse({ type: [DepartmentResponseDto] })
  list(): Promise<DepartmentResponseDto[]> {
    return this.departments.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail departemen' })
  @ApiOkResponse({ type: DepartmentResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DepartmentResponseDto> {
    return this.departments.findOne(id);
  }

  @Post()
  @Audit(OrganizationAuditActions.departmentCreate)
  @ApiOperation({ summary: 'Tambah departemen' })
  @ApiCreatedResponse({ type: DepartmentResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Nama sudah dipakai',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreateDepartmentDto): Promise<DepartmentResponseDto> {
    return this.departments.create(dto);
  }

  @Patch(':id')
  @Audit(OrganizationAuditActions.departmentUpdate)
  @ApiOperation({ summary: 'Ubah nama departemen' })
  @ApiOkResponse({ type: DepartmentResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Nama sudah dipakai',
    type: ErrorResponseDto,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ): Promise<DepartmentResponseDto> {
    return this.departments.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit(OrganizationAuditActions.departmentDelete)
  @ApiOperation({
    summary: 'Hapus departemen',
    description:
      'Ditolak 409 jika masih dipakai karyawan (termasuk nonaktif) atau ' +
      'masih punya jabatan; jumlahnya ada di details.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Masih dipakai. details: { employeeCount, positionCount }',
    type: ErrorResponseDto,
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.departments.remove(id);
  }
}
