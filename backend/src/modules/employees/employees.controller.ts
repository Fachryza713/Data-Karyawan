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
  Query,
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
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role } from '../../generated/prisma/enums.js';
import { Audit } from '../audit/audit.decorator.js';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
} from './dto/employee-request.dto.js';
import {
  CreateEmployeeResponseDto,
  EmployeeListResponseDto,
  EmployeeResponseDto,
} from './dto/employee-response.dto.js';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto.js';
import { EmployeeAuditActions } from './employees.constants.js';
import { EmployeesService } from './employees.service.js';

@ApiTags('Employees (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @ApiOperation({
    summary: 'Daftar karyawan (pagination, pencarian, filter, sort)',
    description:
      'Default hanya karyawan aktif; status=inactive untuk karyawan yang ' +
      'sudah di-soft delete. search mencari sebagian nama, NIP, atau email.',
  })
  @ApiOkResponse({ type: EmployeeListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @Query() query: ListEmployeesQueryDto,
  ): Promise<EmployeeListResponseDto> {
    return this.employees.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detail karyawan',
    description: 'Karyawan nonaktif tetap bisa dilihat (isActive false).',
  })
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EmployeeResponseDto> {
    return this.employees.findOne(id);
  }

  @Post()
  @Audit(EmployeeAuditActions.create)
  @ApiOperation({
    summary: 'Tambah karyawan dan kirim email undangan',
    description:
      'Membuat akun login + data karyawan dalam satu transaksi, lalu mengirim ' +
      'email berisi link set password (berlaku 72 jam, sekali pakai). NIP dan ' +
      'email harus unik; jabatan harus milik departemen yang dipilih.',
  })
  @ApiCreatedResponse({ type: CreateEmployeeResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'NIP atau email sudah dipakai',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreateEmployeeDto): Promise<CreateEmployeeResponseDto> {
    return this.employees.create(dto);
  }

  @Patch(':id')
  @Audit(EmployeeAuditActions.update)
  @ApiOperation({
    summary: 'Ubah data karyawan aktif',
    description:
      'Hanya field yang dikirim yang diubah. phone, gender, birthDate boleh ' +
      'null untuk mengosongkan. Karyawan nonaktif harus dipulihkan dulu.',
  })
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'NIP atau email sudah dipakai',
    type: ErrorResponseDto,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponseDto> {
    return this.employees.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit(EmployeeAuditActions.delete)
  @ApiOperation({
    summary: 'Nonaktifkan karyawan (soft delete)',
    description:
      'Mengisi deletedAt, menonaktifkan akun login, dan mencabut semua refresh ' +
      'token. Access token yang masih berlaku habis dalam maksimal 15 menit. ' +
      'Riwayat tetap tersimpan; pulihkan dengan POST /employees/:id/restore.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    description: 'Menonaktifkan akun sendiri',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Karyawan sudah nonaktif',
    type: ErrorResponseDto,
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.employees.remove(id, actor);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @Audit(EmployeeAuditActions.restore)
  @ApiOperation({
    summary: 'Pulihkan karyawan nonaktif',
    description: 'Akun bisa login lagi (sesi lama tetap dicabut).',
  })
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Karyawan masih aktif',
    type: ErrorResponseDto,
  })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EmployeeResponseDto> {
    return this.employees.restore(id);
  }
}
