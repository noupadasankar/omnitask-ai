import { Logger } from '@nestjs/common';

export function CircuitBreaker(circuitName: string) {
  const logger = new Logger(`CircuitBreaker:${circuitName}`);

  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const circuitBreakerService = (this as any).circuitBreakerService;
      if (!circuitBreakerService) {
        logger.warn('CircuitBreakerService not injected — skipping breaker');
        return originalMethod.apply(this, args);
      }

      if (!circuitBreakerService.isAllowed(circuitName)) {
        logger.warn(`Circuit ${circuitName} is OPEN — failing fast`);
        throw new Error(`Circuit ${circuitName} is OPEN`);
      }

      try {
        const result = await originalMethod.apply(this, args);
        circuitBreakerService.onSuccess(circuitName);
        return result;
      } catch (err) {
        circuitBreakerService.onFailure(circuitName);
        throw err;
      }
    };

    return descriptor;
  };
}
