import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { composePropertyDecorators } from '../../../common/decorators/compose.js';
import { trimString } from '../../../common/validation/fields.js';
import {
  CONTACT_EMAIL_PATTERN,
  normalizeEmail,
  WHATSAPP_PATTERN,
} from '../../../common/validation/formats.js';
import { CONTACT_HOURS_MAX_LENGTH } from '../settings.constants.js';

const EMAIL_MESSAGE = 'Format email tidak valid';

const ContactEmailField = () =>
  composePropertyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeEmail(value) : value,
    ),
    IsEmail({}, { message: EMAIL_MESSAGE }),
    // Dipakai di link mailto:, jadi karakter seperti ? dan & ditolak.
    Matches(CONTACT_EMAIL_PATTERN, { message: EMAIL_MESSAGE }),
    MaxLength(254, { message: 'Email maksimal 254 karakter' }),
  );

const WhatsappField = () =>
  composePropertyDecorators(
    Transform(trimString),
    IsString({ message: 'Nomor WhatsApp harus berupa teks' }),
    Matches(WHATSAPP_PATTERN, {
      message:
        'Nomor WhatsApp harus berformat 62xxxxxxxxx (10-14 digit, tanpa +, spasi, atau 0 di depan), contoh 6281234567890',
    }),
  );

const HoursField = () =>
  composePropertyDecorators(
    Transform(trimString),
    IsString({ message: 'Jam layanan harus berupa teks' }),
    MinLength(1, { message: 'Jam layanan wajib diisi' }),
    MaxLength(CONTACT_HOURS_MAX_LENGTH, {
      message: `Jam layanan maksimal ${CONTACT_HOURS_MAX_LENGTH} karakter`,
    }),
  );

/** Body PUT kontak: semua field wajib (mengganti seluruh nilai). */
export class UpdateContactDto {
  @ApiProperty({ example: 'hr@bluerose.test', maxLength: 254 })
  @ContactEmailField()
  email: string;

  @ApiProperty({
    example: '6281200000000',
    pattern: WHATSAPP_PATTERN.source,
    description: 'Format wa.me: diawali 62, tanpa +, spasi, atau strip.',
  })
  @WhatsappField()
  whatsapp: string;

  @ApiProperty({
    example: 'Senin-Jumat 08:30-17:30 WIB',
    maxLength: CONTACT_HOURS_MAX_LENGTH,
  })
  @HoursField()
  hours: string;
}

export class ContactResponseDto {
  @ApiProperty({ example: 'hr@bluerose.test' })
  email: string;

  @ApiProperty({ example: '6281200000000' })
  whatsapp: string;

  @ApiProperty({ example: 'Senin-Jumat 08:30-17:30 WIB' })
  hours: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
