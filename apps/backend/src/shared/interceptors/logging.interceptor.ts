import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const start = Date.now();
    return next.handle().pipe(tap({ next: () => this.logger.log(`${req.method} ${req.url} ${Date.now()-start}ms`), error: (e) => this.logger.error(`${req.method} ${req.url} ERROR: ${e.message}`) }));
  }
}