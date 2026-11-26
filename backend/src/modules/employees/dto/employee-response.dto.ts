import { ApiProperty } from '@nestjs/swagger';
import { NamedRefDto, ShiftRefDto } from '../../../common/dto/named-ref.dto.js';
import { PageMetaDto } from '../../../common/dto/pagination.dto.js';
import {
  EmploymentStatus,
  Gender,
  Role,
} from '../../../generated/prisma/enums.js';

/** Data karyawan yang dikirim ke klien (bukan objek Prisma mentah). */
export class EmployeeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'BRT-2026-0042' })
  nip: string;

  @ApiProperty({ example: 'Raditya Pratama' })
  fullName: string;

  @ApiProperty({ example: 'raditya.pratama@bluerose.test' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;

  @ApiProperty({ type: String, nullable: true, example: '0812-3456-7890' })
  phone: string | null;

  @ApiProperty({ enum: Gender, enumName: 'Gender', nullable: true })
  gender: Gender | null;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  birthDate: string | null;

  @ApiProperty({ format: 'date' })
  joinDate: string;

  @ApiProperty({ enum: EmploymentStatus, enumName: 'EmploymentStatus' })
  employmentStatus: EmploymentStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Presigned URL foto profil, berlaku 1 jam. Null jika belum ada foto.',
  })
  photoUrl: string | null;

  @ApiProperty({
    description: 'False jika karyawan sudah di-soft delete (nonaktif).',
  })
  isActive: boolean;

  @ApiProperty({ type: NamedRefDto })
  department: NamedRefDto;

  @ApiProperty({ type: NamedRefDto })
  position: NamedRefDto;

  @ApiProperty({ type: NamedRefDto })
  officeLocation: NamedRefDto;

  @ApiProperty({ type: ShiftRefDto })
  shift: ShiftRefDto;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deletedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CreateEmployeeResponseDto extends EmployeeResponseDto {
  @ApiProperty({
    description:
      'False jika email undangan gagal dikirim. Karyawan tetap bisa memakai ' +
      '"Lupa password" untuk membuat password.',
  })
  invitationSent: boolean;
}

export class EmployeeListResponseDto {
  @ApiProperty({ type: [EmployeeResponseDto] })
  data: EmployeeResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  meta: PageMetaDto;
}

export class PhotoUploadUrlResponseDto {
  @ApiProperty({ example: 'employees/0196.../avatar-1b4e...' })
  key: string;

  @ApiProperty({ enum: ['POST'], description: 'Method upload ke storage.' })
  method: 'POST';

  @ApiProperty({ example: 'http://localhost:9000/hris-files' })
  url: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Kirim semua field ini sebagai multipart/form-data ke url, lalu field ' +
      '"file" berisi foto (harus paling akhir).',
  })
  fields: Record<string, string>;

  @ApiProperty({ example: 2097152 })
  maxBytes: number;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}
