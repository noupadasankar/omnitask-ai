import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const mockContext = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { role: 'admin' } }),
    }),
  } as ExecutionContext;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  describe('handleRequest()', () => {
    it('should return the user when no error and user is present (valid JWT)', () => {
      const user = { id: 1, email: 'user@example.com', role: 'admin' };

      const result = guard.handleRequest(null, user, null, mockContext);

      expect(result).toBe(user);
    });

    it('should throw UnauthorizedException when user is null (missing or expired JWT)', () => {
      expect(() => {
        guard.handleRequest(null, null, null, mockContext);
      }).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is undefined', () => {
      expect(() => {
        guard.handleRequest(null, undefined, null, mockContext);
      }).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with correct message when user is null', () => {
      expect(() => {
        guard.handleRequest(null, null, null, mockContext);
      }).toThrow('Authentication required or token invalid');
    });

    it('should throw UnauthorizedException when an error is passed (expired JWT)', () => {
      const expiredError = new Error('TokenExpiredError');

      expect(() => {
        guard.handleRequest(expiredError, null, null, mockContext);
      }).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with correct message on expired JWT error', () => {
      const expiredError = new Error('TokenExpiredError');

      expect(() => {
        guard.handleRequest(expiredError, null, null, mockContext);
      }).toThrow('Authentication required or token invalid');
    });

    it('should throw UnauthorizedException when error is present even if user is present', () => {
      const user = { id: 1, email: 'user@example.com', role: 'admin' };
      const error = new Error('Some auth error');

      expect(() => {
        guard.handleRequest(error, user, null, mockContext);
      }).toThrow(UnauthorizedException);
    });

    it('should return user with all properties intact when JWT is valid', () => {
      const user = { id: 42, email: 'alice@example.com', role: 'user', sub: 'uuid-123' };

      const result = guard.handleRequest(null, user, null, mockContext);

      expect(result).toEqual(user);
      expect(result.id).toBe(42);
      expect(result.role).toBe('user');
    });
  });
});
