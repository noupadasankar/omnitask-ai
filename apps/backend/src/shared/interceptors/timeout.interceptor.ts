import { Injectable, NestInterceptor, ExecutionContext, CallHandler, RequestTimeoutException } from '@nestjs/common';
import { Observable, timeout, TimeoutError, catchError, throwError } from 'rxjs';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly ms: number) {}
  intercept(_: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.ms),
      catchError((e) => throwError(() => e instanceof TimeoutError ? new RequestTimeoutException() : e)),
    );
  }
}