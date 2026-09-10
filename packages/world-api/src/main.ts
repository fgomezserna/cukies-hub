import { gameEnv } from '@cukies/world-shared';
import cookie, { FastifyCookieOptions } from '@fastify/cookie';
import cors from '@fastify/cors';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { WorldFallbackExceptionFilter, WorldHttpExceptionFilter, WorldWriteGateGuard } from '@cukies/world-shared';
import { AppModule } from './app/app.module';
import { RedactingLoggingInterceptor } from './app/interceptors/redacting-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  app.useGlobalInterceptors(new RedactingLoggingInterceptor());
  app.useGlobalFilters(
    new WorldFallbackExceptionFilter(),
    new WorldHttpExceptionFilter()
  );
  app.useGlobalGuards(new WorldWriteGateGuard(gameEnv));

  app.register(cookie as any, {
    secret: gameEnv.sessionSecret,
    parseOptions: {},
  } as FastifyCookieOptions);

  app.register(cors as any, {
    origin: gameEnv.corsOrigins,
    credentials: true,
  });
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Game api')
    .setDescription('This is an api for managing data for the game')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(
    gameEnv.port,
    gameEnv.address,
    (error, address) => {
      Logger.log(`🚀 Application is running on: ${address}`);
    }
  );
}

bootstrap();
