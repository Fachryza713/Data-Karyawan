import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { CompanySettingsService } from './company-settings.service.js';
import { ContactResponseDto, UpdateContactDto } from './dto/contact.dto.js';
import {
  ContactSettingKey,
  SettingsAuditActions,
} from './settings.constants.js';

const PUT_DESCRIPTION =
  'Mengganti seluruh kontak (dibuat jika belum ada). whatsapp berformat 62xxxxxxxxx.';

@ApiTags('Settings')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('settings')
export class CompanySettingsController {
  constructor(private readonly settings: CompanySettingsService) {}

  @Get('hr-contact')
  @ApiOperation({
    summary: 'Kontak HR (semua role)',
    description: 'Ditampilkan di halaman Bantuan karyawan.',
  })
  @ApiOkResponse({ type: ContactResponseDto })
  @ApiNotFoundResponse({ description: 'Belum diatur', type: ErrorResponseDto })
  getHrContact(): Promise<ContactResponseDto> {
    return this.settings.getContact(ContactSettingKey.hr);
  }

  @Put('hr-contact')
  @Roles(Role.HR)
  @Audit(SettingsAuditActions.companySettingUpdate)
  @ApiOperation({
    summary: 'Ubah kontak HR (HR)',
    description: PUT_DESCRIPTION,
  })
  @ApiOkResponse({ type: ContactResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  updateHrContact(@Body() dto: UpdateContactDto): Promise<ContactResponseDto> {
    return this.settings.updateContact(ContactSettingKey.hr, dto);
  }

  @Get('admin-contact')
  @ApiOperation({
    summary: 'Kontak admin sistem (semua role)',
    description: 'Ditampilkan di halaman Bantuan HR.',
  })
  @ApiOkResponse({ type: ContactResponseDto })
  @ApiNotFoundResponse({ description: 'Belum diatur', type: ErrorResponseDto })
  getAdminContact(): Promise<ContactResponseDto> {
    return this.settings.getContact(ContactSettingKey.admin);
  }

  @Put('admin-contact')
  @Roles(Role.HR)
  @Audit(SettingsAuditActions.companySettingUpdate)
  @ApiOperation({
    summary: 'Ubah kontak admin sistem (HR)',
    description: PUT_DESCRIPTION,
  })
  @ApiOkResponse({ type: ContactResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  updateAdminContact(
    @Body() dto: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    return this.settings.updateContact(ContactSettingKey.admin, dto);
  }
}
