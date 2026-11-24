import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { config } from './config';

/**
 * Configuración HTTP común: la usan el servidor (main.ts) y las herramientas de inventario y OpenAPI,
 * para que el contrato documentado sea exactamente el que se sirve.
 */
export function configureApp(app: NestExpressApplication): void {
  // Solo los proxies listados pueden fijar la IP del cliente (X-Forwarded-For). Nunca 'true'.
  app.set('trust proxy', config.trustedProxies);
  app.useBodyParser('raw', { type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' });
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, credentials: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
}

export function buildOpenApi(app: NestExpressApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('API IINICIA').setVersion('1.0').addBearerAuth().build());
}
