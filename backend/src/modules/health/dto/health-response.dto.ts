import { ApiProperty } from '@nestjs/swagger';

const statusExample = {
  database: { status: 'up' },
  redis: { status: 'up' },
};

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: statusExample,
  })
  info: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true, example: {} })
  error: Record<string, unknown>;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: statusExample,
  })
  details: Record<string, unknown>;
}
