import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN =
  /(^|_)(token|password|secret|authorization|cookie|jwt)($|_)/i;
const SENSITIVE_EXACT_KEYS = new Set([
  'cukiId',
  'islandPermissionToken',
  'joinToken',
  'serverToken',
]);
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function redactSensitiveMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveMetadata(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        if (SENSITIVE_EXACT_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, REDACTED];
        }

        return [key, redactSensitiveMetadata(entry)];
      })
    );
  }

  if (typeof value === 'string' && JWT_PATTERN.test(value)) {
    return REDACTED;
  }

  return value;
}

@Injectable()
export class RedactingLoggingInterceptor implements NestInterceptor {
  intercept(
    executionContext: ExecutionContext,
    next: CallHandler
  ): Observable<unknown> {
    if (executionContext.getType() !== 'http') {
      return next.handle();
    }

    const request = executionContext.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const requestId = randomUUID();
    const className = executionContext.getClass().name;
    const handler = executionContext.getHandler().name;
    const ipAddress =
      request.headers?.['x-forwarded-for'] ||
      request.socket?.remoteAddress ||
      request.connection?.remoteAddress;

    request.contextInfo = {
      requestId,
      className,
      handler,
      ipAddress,
    };

    if (className === 'ContainerHealthCheckController') {
      return next.handle();
    }

    const logger = new Logger(className);
    const metadataObject: Record<string, unknown> = {};

    for (const property of ['body', 'query', 'params']) {
      const value = request?.[property];
      if (value && Object.keys(value).length > 0) {
        metadataObject[property] = redactSensitiveMetadata(value);
      }
    }

    const metadata =
      Object.keys(metadataObject).length > 0
        ? { metadata: metadataObject }
        : {};

    logger.log(
      JSON.stringify({
        message: `Start of ${method}(${url})`,
        requestId,
        functionName: handler,
        ipAddress,
        ...metadata,
      })
    );

    return next
      .handle()
      .pipe(
        tap(() =>
          logger.log(
            JSON.stringify({
              message: `End of ${method}(${url})`,
              requestId,
            })
          )
        )
      );
  }
}
