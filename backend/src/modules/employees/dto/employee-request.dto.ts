import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IsBirthDate,
  IsDateOnly,
  OptionalNonNull,
} from '../../../common/validation/validators.js';
import { NIP_PATTERN } from '../../../common/validation/formats.js';
import {
  EmploymentStatus,
  Gender,
  Role,
} from '../../../generated/prisma/enums.js';
import {
  EmailField,
  EmploymentStatusField,
  FullNameField,
  GenderField,
  NipField,
  PhoneField,
  UuidField,
} from './employee-fields.js';

// Semua body divalidasi ValidationPipe global (whitelist +
// forbidNonWhitelisted): field yang tidak ada di DTO ditolak 400.

export class CreateEmployeeDto {
  @ApiProperty({ example: 'raditya.pratama@bluerose.test', maxLength: 254 })
  @EmailField()
  email: string;

  @ApiProperty({
    example: 'BRT-2026-0042',
    pattern: NIP_PATTERN.source,
    description:
      'Disimpan huruf besar. Unik, termasuk terhadap karyawan nonaktif.',
  })
  @NipField()
  nip: string;

  @ApiProperty({ example: 'Raditya Pratama', maxLength: 100 })
  @FullNameField()
  fullName: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '0812-3456-7890',
  })
  @IsOptional()
  @PhoneField()
  phone?: string | null;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  @IsOptional()
  @GenderField()
  gender?: Gender | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '1998-04-12',
  })
  @IsOptional()
  @IsBirthDate()
  birthDate?: string | null;

  @ApiProperty({ format: 'uuid' })
  @UuidField()
  departmentId: string;

  @ApiProperty({ format: 'uuid', description: 'Harus milik departmentId.' })
  @UuidField()
  positionId: string;

  @ApiProperty({ format: 'uuid' })
  @UuidField()
  officeLocationId: string;

  @ApiProperty({ format: 'uuid' })
  @UuidField()
  shiftId: string;

  @ApiProperty({ format: 'date', example: '2026-12-01' })
  @IsDateOnly()
  joinDate: string;

  @ApiProperty({ enum: EmploymentStatus, enumName: 'EmploymentStatus' })
  @EmploymentStatusField()
  employmentStatus: EmploymentStatus;

  @ApiPropertyOptional({
    enum: Role,
    enumName: 'Role',
    default: Role.EMPLOYEE,
    description: 'Role akun login. Default EMPLOYEE.',
  })
  @IsOptional()
  @IsEnum(Role, { message: 'role harus HR atau EMPLOYEE' })
  role?: Role;
}

/**
 * PATCH /employees/:id (HR). Semua field opsional; field wajib tidak boleh
 * dikirim null. phone, gender, birthDate boleh null untuk mengosongkan.
 * Role tidak bisa diubah di sini.
 */
export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'raditya.pratama@bluerose.test' })
  @OptionalNonNull()
  @EmailField()
  email?: string;

  @ApiPropertyOptional({
    example: 'BRT-2026-0042',
    pattern: NIP_PATTERN.source,
  })
  @OptionalNonNull()
  @NipField()
  nip?: string;

  @ApiPropertyOptional({ example: 'Raditya Pratama', maxLength: 100 })
  @OptionalNonNull()
  @FullNameField()
  fullName?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @PhoneField()
  phone?: string | null;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  @IsOptional()
  @GenderField()
  gender?: Gender | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @IsBirthDate()
  birthDate?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalNonNull()
  @UuidField()
  departmentId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Harus milik departemen (baru atau yang sekarang).',
  })
  @OptionalNonNull()
  @UuidField()
  positionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalNonNull()
  @UuidField()
  officeLocationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @OptionalNonNull()
  @UuidField()
  shiftId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @OptionalNonNull()
  @IsDateOnly()
  joinDate?: string;

  @ApiPropertyOptional({ enum: EmploymentStatus, enumName: 'EmploymentStatus' })
  @OptionalNonNull()
  @EmploymentStatusField()
  employmentStatus?: EmploymentStatus;
}

/**
 * PATCH /employees/me. Hanya data diri: fullName, phone, gender, birthDate.
 * Field lain (departmentId, role, nip, email, ...) ditolak 400 oleh
 * ValidationPipe karena tidak ada di DTO ini.
 */
export class UpdateMyProfileDto {
  @ApiPropertyOptional({ example: 'Raditya Pratama', maxLength: 100 })
  @OptionalNonNull()
  @FullNameField()
  fullName?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '0812-3456-7890',
    description: 'Kirim null atau "" untuk menghapus.',
  })
  @IsOptional()
  @PhoneField()
  phone?: string | null;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  @IsOptional()
  @GenderField()
  gender?: Gender | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '1998-04-12',
  })
  @IsOptional()
  @IsBirthDate()
  birthDate?: string | null;
}

export class PhotoUploadUrlDto {
  @ApiProperty({
    example: 'image/jpeg',
    description: 'image/jpeg atau image/png',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'contentType harus berupa teks' })
  @MaxLength(100)
  contentType: string;

  @ApiProperty({
    example: 245760,
    description: 'Ukuran file dalam byte (maks 2 MB).',
  })
  @IsInt({ message: 'size harus bilangan bulat (byte)' })
  @Min(1, { message: 'size minimal 1 byte' })
  size: number;
}

export class ConfirmPhotoDto {
  @ApiProperty({
    example: 'employees/0196.../avatar-1b4e...',
    description: 'key dari POST /employees/me/photo/upload-url',
  })
  @IsString({ message: 'key harus berupa teks' })
  @MaxLength(200)
  key: string;
}
