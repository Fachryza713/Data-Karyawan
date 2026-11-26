import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Format error seragam untuk semua endpoint. */
export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({ example: 'Not Found' })
  error: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Data tidak ditemukan',
    description:
      'Pesan error. Berupa array untuk error validasi (satu pesan per field).',
  })
  message: string | string[];

  @ApiProperty({ example: '/api/v1/contoh/123' })
  path: string;

  @ApiProperty({ example: '2026-11-25T08:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '6f1c2f0e-8f0a-4f1b-9a51-2f7a4c1d9e3b' })
  requestId: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { employeeCount: 3 },
    description:
      'Data tambahan untuk sebagian error, contoh jumlah karyawan yang masih ' +
      'memakai departemen saat hapus ditolak (409).',
  })
  details?: Record<string, unknown>;
}
