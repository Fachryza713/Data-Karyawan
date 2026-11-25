import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail } from '../../../common/validation/formats.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth.constants.js';
import { OPAQUE_TOKEN_PATTERN } from '../auth.crypto.js';

const toNormalizedEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeEmail(value) : value;

export class LoginDto {
  @ApiProperty({ example: 'hr@bluerose.test' })
  @Transform(toNormalizedEmail)
  @IsEmail({}, { message: 'Format email tidak valid' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'BlueRose#2026', format: 'password' })
  @IsString()
  @IsNotEmpty({ message: 'Password wajib diisi' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'karyawan@bluerose.test' })
  @Transform(toNormalizedEmail)
  @IsEmail({}, { message: 'Format email tidak valid' })
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Token dari link email (parameter ?token=)',
    example: 'k3Jq0mZ8W1pX4n7vR2sT5uY8aB1cD4eF7gH0iJ3kL6m',
  })
  @IsString()
  @Matches(OPAQUE_TOKEN_PATTERN, { message: 'Token tidak valid' })
  token: string;

  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    format: 'password',
    example: 'PasswordBaru#2026',
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password minimal ${PASSWORD_MIN_LENGTH} karakter`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password maksimal ${PASSWORD_MAX_LENGTH} karakter`,
  })
  newPassword: string;
}
