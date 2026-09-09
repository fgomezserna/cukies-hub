import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch(HttpException)
export class WorldHttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = exception.getStatus();
    response.status(status).send({ statusCode: status, message: exception.message, error: exception.name });
  }
}

@Catch()
export class WorldFallbackExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ statusCode: 500, message: 'World internal error', error: 'InternalServerError' });
    if (process.env.NODE_ENV !== 'test') console.error(exception);
  }
}
