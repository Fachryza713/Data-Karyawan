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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { Role } from '../../generated/prisma/enums.js';
import { Audit } from '../audit/audit.decorator.js';
import {
  CreatePositionDto,
  ListPositionsQueryDto,
  PositionResponseDto,
  UpdatePositionDto,
} from './dto/organization.dto.js';
import { OrganizationAuditActions } from './organization.constants.js';
import { PositionsService } from './positions.service.js';

@ApiTags('Positions (HR)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Roles(Role.HR)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar jabatan (opsional per departemen)' })
  @ApiOkResponse({ type: [PositionResponseDto] })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(@Query() query: ListPositionsQueryDto): Promise<PositionResponseDto[]> {
    return this.positions.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail jabatan' })
  @ApiOkResponse({ type: PositionResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PositionResponseDto> {
    return this.positions.findOne(id);
  }

  @Post()
  @Audit(OrganizationAuditActions.positionCreate)
  @ApiOperation({ summary: 'Tambah jabatan di sebuah departemen' })
  @ApiCreatedResponse({ type: PositionResponseDto })
  @ApiBadRequestResponse({
    description: 'Input tidak valid atau departemen tidak ditemukan',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Nama sudah dipakai di departemen itu',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreatePositionDto): Promise<PositionResponseDto> {
    return this.positions.create(dto);
  }

  @Patch(':id')
  @Audit(OrganizationAuditActions.positionUpdate)
  @ApiOperation({
    summary: 'Ubah nama atau departemen jabatan',
    description:
      'Pindah departemen ditolak 409 jika jabatan masih dipakai karyawan.',
  })
  @ApiOkResponse({ type: PositionResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
  ): Promise<PositionResponseDto> {
    return this.positions.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit(OrganizationAuditActions.positionDelete)
  @ApiOperation({
    summary: 'Hapus jabatan',
    description:
      'Ditolak 409 jika masih dipakai karyawan (termasuk nonaktif); ' +
      'jumlahnya ada di details.employeeCount.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'Masih dipakai. details: { employeeCount }',
    type: ErrorResponseDto,
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.positions.remove(id);
  }
}
