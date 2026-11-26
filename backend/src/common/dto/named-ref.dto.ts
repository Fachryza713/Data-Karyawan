import { ApiProperty } from '@nestjs/swagger';

/** Referensi singkat ke data master (departemen, jabatan, kantor). */
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
