import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isCsrfError =
      exception instanceof Error &&
      (exception.message?.toLowerCase().includes('csrf') ||
        (exception as any).code === 'EBADCSRFTOKEN');

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : isCsrfError
          ? HttpStatus.FORBIDDEN
          : HttpStatus.INTERNAL_SERVER_ERROR;

    let errorMessage: string | string[];
    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      // Only propagate known-safe fields; never expose the raw object or stack traces.
      if (typeof raw === 'string') {
        errorMessage = raw;
      } else if (typeof raw === 'object' && raw !== null) {
        errorMessage = (raw as any).message ?? exception.message;
      } else {
        errorMessage = exception.message;
      }
    } else {
      errorMessage = 'Internal server error';
    }

    response.status(status).json({
      statusCode: status,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: errorMessage,
    });
  }
}
