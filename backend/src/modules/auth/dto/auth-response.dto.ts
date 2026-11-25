import { ApiProperty } from '@nestjs/swagger';
import {
  EmploymentStatus,
  Gender,
  Role,
} from '../../../generated/prisma/enums.js';

// Response sengaja dibentuk manual dari `select` yang eksplisit:
// passwordHash tidak pernah ikut terbaca, apalagi terkirim.

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'hr@bluerose.test' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  employeeId: string | null;
}

export class LoginResponseDto {
  @ApiProperty({
    description:
      'JWT, berlaku 15 menit. Kirim sebagai header Authorization: Bearer <token>. ' +
      'Refresh token dikirim terpisah sebagai cookie httpOnly refresh_token.',
  })
  accessToken: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}

export class MessageResponseDto {
  @ApiProperty()
  message: string;
}

export class NamedRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class ShiftRefDto extends NamedRefDto {
  @ApiProperty({ example: '08:30' })
  startTime: string;

  @ApiProperty({ example: '17:30' })
  endTime: string;

  @ApiProperty({ example: 15 })
  lateToleranceMin: number;
}

export class MeEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BRT-2024-0001' })
  nip: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ nullable: true, type: String })
  phone: string | null;

  @ApiProperty({ enum: Gender, enumName: 'Gender', nullable: true })
  gender: Gender | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  birthDate: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Object key foto di storage',
  })
  photoKey: string | null;

  @ApiProperty({ format: 'date' })
  joinDate: string;

  @ApiProperty({ enum: EmploymentStatus, enumName: 'EmploymentStatus' })
  employmentStatus: EmploymentStatus;

  @ApiProperty({ type: NamedRefDto })
  department: NamedRefDto;

  @ApiProperty({ type: NamedRefDto })
  position: NamedRefDto;

  @ApiProperty({ type: NamedRefDto })
  officeLocation: NamedRefDto;

  @ApiProperty({ type: ShiftRefDto })
  shift: ShiftRefDto;
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  lastLoginAt: string | null;

  @ApiProperty({ type: MeEmployeeDto, nullable: true })
  employee: MeEmployeeDto | null;
}
