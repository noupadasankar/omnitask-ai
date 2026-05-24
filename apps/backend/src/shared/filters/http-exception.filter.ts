import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException
      ? ((exception.getResponse() as any)?.message ?? exception.message)
      : 'Internal server error';
    if (status >= 500) this.logger.error(`${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    res.status(status).send({ statusCode: status, error: HttpStatus[status], message, path: req.url, timestamp: new Date().toISOString() });
  }
}