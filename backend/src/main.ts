import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Solo los proxies listados pueden fijar la IP del cliente (X-Forwarded-For). Nunca 'true'.
  app.set('trust proxy', config.trustedProxies);
  app.useBodyParser('raw', { type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' });
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, credentials: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  if (!config.production) {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder()
      .setTitle('API IINICIA').setVersion('1.0').addBearerAuth().build());
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.port, config.host);
  new Logger('Bootstrap').log(`API en http://${config.host}:${config.port}/api (proxies de confianza: ${config.trustedProxies.join(', ')})`);
}

void bootstrap();
