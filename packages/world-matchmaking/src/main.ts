import { WorldFallbackExceptionFilter, WorldHttpExceptionFilter, matchmakingEnv } from '@cukies/world-shared';
import cookie, { FastifyCookieOptions } from '@fastify/cookie';
import cors from '@fastify/cors';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
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
  app.register(cookie as any, {
    secret: matchmakingEnv.sessionSecret,
    parseOptions: {}, // options for parsing cookies
  } as FastifyCookieOptions);

  app.register(cors as any, {
    origin: matchmakingEnv.corsOrigins,
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(
    matchmakingEnv.port,
    matchmakingEnv.address,
    (error, address) => {
      Logger.log(`🚀 Application is running on: ${address}`);
    }
  );
}

bootstrap();
