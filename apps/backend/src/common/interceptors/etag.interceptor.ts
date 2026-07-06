import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import * as crypto from 'crypto';

@Injectable()
export class EtagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((body) => {
        const response = context.switchToHttp().getResponse();
        const method = context.switchToHttp().getRequest().method;

        if (method === 'GET' && body !== undefined) {
          const hash = crypto
            .createHash('md5')
            .update(JSON.stringify(body))
            .digest('hex');
          response.setHeader('ETag', `"${hash}"`);

          const ifNoneMatch = context.switchToHttp().getRequest().headers['if-none-match'];
          if (ifNoneMatch === `"${hash}"`) {
            response.status(304);
            return null;
          }
        }

        return body;
      }),
    );
  }
}
