import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ConflictException,
} from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly inFlight = new Set<string>();

  constructor(private readonly idempotencyService: IdempotencyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const method = request.method;
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) return true;

    const userId = request.user?.id || 'anonymous';
    const route = `${method}:${request.route?.path || request.url}`;
    const scopedKey = `${userId}:${route}:${idempotencyKey}`;

    // Race-condition guard: reject duplicate in-flight requests with same key
    if (this.inFlight.has(scopedKey)) {
      throw new ConflictException('Request with this idempotency key is already being processed');
    }
    this.inFlight.add(scopedKey);

    try {
      const existing = await this.idempotencyService.getResponse(scopedKey);
      if (existing) {
        response.status(existing.statusCode).json(existing.body);
        return false;
      }

      const originalJson = response.json.bind(response);
      response.json = (body: unknown) => {
        this.idempotencyService.setResponse(
          scopedKey,
          userId,
          route,
          response.statusCode,
          body,
        ).catch(() => {});
        return originalJson(body);
      };

      return true;
    } finally {
      this.inFlight.delete(scopedKey);
    }
  }
}
