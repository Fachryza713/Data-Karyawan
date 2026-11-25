import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';

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
