import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApi, configureApp } from './app.setup';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  if (!config.production) SwaggerModule.setup('api/docs', app, buildOpenApi(app));

  await app.listen(config.port, config.host);
  new Logger('Bootstrap').log(`API en http://${config.host}:${config.port}/api (proxies de confianza: ${config.trustedProxies.join(', ')})`);
}

void bootstrap();
