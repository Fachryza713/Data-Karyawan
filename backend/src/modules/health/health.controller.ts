import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  type HealthCheckResult,
} from '@nestjs/terminus';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { HealthResponseDto } from './dto/health-response.dto.js';
import { DatabaseHealthIndicator } from './indicators/database.health.js';
import { RedisHealthIndicator } from './indicators/redis.health.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck({ swaggerDocumentation: false })
  @ApiOperation({
    summary: 'Cek kesehatan API beserta koneksi PostgreSQL dan Redis',
  })
  @ApiOkResponse({
    type: HealthResponseDto,
    description: 'Semua dependensi sehat',
  })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: 'Ada dependensi yang tidak bisa dihubungi',
  })
  async check(): Promise<HealthCheckResult> {
    try {
      return await this.health.check([
        () => this.database.isHealthy('database'),
        () => this.redis.isHealthy('redis'),
      ]);
    } catch (error) {
      // Terminus melempar 503 berisi detail tiap dependensi. Detail error
      // (host, pesan driver) cukup di log; respons hanya menyebut namanya.
      if (error instanceof ServiceUnavailableException) {
        const result = error.getResponse() as Partial<HealthCheckResult>;
        const down = Object.keys(result.error ?? {});
        throw new ServiceUnavailableException(
          down.length
            ? `Dependensi tidak sehat: ${down.join(', ')}`
            : 'Layanan belum siap',
        );
      }
      throw error;
    }
  }
}
