import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { REFRESH_COOKIE_NAME } from '../modules/auth/auth.constants.js';

export const SWAGGER_PATH = 'docs';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('HRIS Blue Rose Tech API')
    .setDescription(
      'REST API HRIS Blue Rose Tech. Semua endpoint bisnis ada di bawah /api/v1. ' +
        'Error selalu berformat { statusCode, error, message, path, timestamp, requestId }.',
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access token JWT',
    })
    .addCookieAuth(
      REFRESH_COOKIE_NAME,
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Refresh token httpOnly. Dipasang otomatis oleh POST /auth/login; ' +
          'Swagger UI di domain yang sama ikut mengirimnya.',
      },
      // Nama skema = nama yang dipakai @ApiCookieAuth(REFRESH_COOKIE_NAME).
      REFRESH_COOKIE_NAME,
    )
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, config, {
      extraModels: [ErrorResponseDto],
    });

  SwaggerModule.setup(SWAGGER_PATH, app, documentFactory, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    swaggerOptions: { persistAuthorization: true },
  });
}
