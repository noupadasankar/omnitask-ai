import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyGuard } from './idempotency.guard';
import { IdempotencyService } from './idempotency.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonFn() {
  // Returns a jest spy that also exposes the response body it was called with
  const fn = jest.fn().mockReturnValue(undefined);
  return fn;
}

interface MockRequestOpts {
  method?: string;
  idempotencyKey?: string;
  userId?: string;
  path?: string;
  url?: string;
}

function makeContext({
  method = 'POST',
  idempotencyKey,
  userId = 'user-1',
  path = '/tasks',
  url = '/tasks',
}: MockRequestOpts = {}) {
  const request = {
    method,
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
    user: userId ? { id: userId } : undefined,
    route: { path },
    url,
  };

  const jsonSpy = makeJsonFn();
  const response = {
    statusCode: 200,
    status: jest.fn().mockReturnThis(),
    json: jsonSpy,
  };

  const context: any = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };

  return { context, request, response, jsonSpy };
}

// ---------------------------------------------------------------------------
// Mock IdempotencyService
// ---------------------------------------------------------------------------

const mockIdempotencyService = {
  getResponse: jest.fn(),
  setResponse: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('IdempotencyGuard', () => {
  let guard: IdempotencyGuard;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyGuard,
        {
          provide: IdempotencyService,
          useValue: mockIdempotencyService,
        },
      ],
    }).compile();

    guard = module.get<IdempotencyGuard>(IdempotencyGuard);
  });

  // -------------------------------------------------------------------------
  // a) Pass-through scenarios — no idempotency key present
  // -------------------------------------------------------------------------

  describe('when no idempotency-key header is present', () => {
    it('returns true for a POST without header', async () => {
      const { context } = makeContext({ method: 'POST' });
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('does NOT call IdempotencyService', async () => {
      const { context } = makeContext({ method: 'POST' });
      await guard.canActivate(context);
      expect(mockIdempotencyService.getResponse).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // a-2) Pass-through for idempotent HTTP methods — GET / HEAD / OPTIONS
  // -------------------------------------------------------------------------

  describe('when the HTTP method is safe (GET / HEAD / OPTIONS)', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])(
      'returns true for %s even when idempotency-key is provided',
      async (method) => {
        const { context } = makeContext({ method, idempotencyKey: 'key-safe' });
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
        expect(mockIdempotencyService.getResponse).not.toHaveBeenCalled();
      },
    );
  });

  // -------------------------------------------------------------------------
  // b) First request with idempotency key — processes normally, wraps json()
  // -------------------------------------------------------------------------

  describe('first request with a new idempotency key', () => {
    const KEY = 'idem-key-new';
    const SCOPED = 'user-1:POST:/tasks:idem-key-new';

    beforeEach(() => {
      // No cached response exists yet
      mockIdempotencyService.getResponse.mockResolvedValue(null);
      mockIdempotencyService.setResponse.mockResolvedValue(undefined);
    });

    it('returns true (allows the handler to run)', async () => {
      const { context } = makeContext({ idempotencyKey: KEY });
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('looks up the scoped key in IdempotencyService', async () => {
      const { context } = makeContext({ idempotencyKey: KEY });
      await guard.canActivate(context);
      expect(mockIdempotencyService.getResponse).toHaveBeenCalledWith(SCOPED);
    });

    it('replaces response.json with a wrapper that persists the result', async () => {
      const { context, response } = makeContext({ idempotencyKey: KEY });
      const originalJson = response.json;
      await guard.canActivate(context);

      // The guard should have monkey-patched json
      expect(response.json).not.toBe(originalJson);

      // Simulate the handler calling response.json()
      response.statusCode = 201;
      response.json({ id: 'task-42' });

      // setResponse must be scheduled (fire-and-forget via .catch(() => {}))
      // Give the microtask queue a tick to settle
      await Promise.resolve();

      expect(mockIdempotencyService.setResponse).toHaveBeenCalledWith(
        SCOPED,
        'user-1',
        'POST:/tasks',
        201,
        { id: 'task-42' },
      );
    });

    it('still calls the original json() so the real response is sent', async () => {
      const { context, response, jsonSpy } = makeContext({ idempotencyKey: KEY });
      await guard.canActivate(context);

      response.json({ ok: true });

      expect(jsonSpy).toHaveBeenCalledWith({ ok: true });
    });

    it('removes the key from inFlight after processing', async () => {
      // If the key were left in inFlight a second sequential call would throw
      const { context } = makeContext({ idempotencyKey: KEY });
      await guard.canActivate(context);

      const { context: context2 } = makeContext({ idempotencyKey: KEY });
      await expect(guard.canActivate(context2)).resolves.toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // c) Duplicate request — returns cached response, does NOT call handler
  // -------------------------------------------------------------------------

  describe('duplicate request with the same idempotency key', () => {
    const KEY = 'idem-key-dup';
    const CACHED = { statusCode: 200, body: { id: 'task-99' } };

    beforeEach(() => {
      mockIdempotencyService.getResponse.mockResolvedValue(CACHED);
    });

    it('returns false so NestJS skips the route handler', async () => {
      const { context } = makeContext({ idempotencyKey: KEY });
      const result = await guard.canActivate(context);
      expect(result).toBe(false);
    });

    it('replays the cached status code and body via response', async () => {
      const { context, response } = makeContext({ idempotencyKey: KEY });
      await guard.canActivate(context);

      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith({ id: 'task-99' });
    });

    it('does NOT call setResponse for a duplicate', async () => {
      const { context } = makeContext({ idempotencyKey: KEY });
      await guard.canActivate(context);
      expect(mockIdempotencyService.setResponse).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // c-2) Concurrent in-flight protection — ConflictException
  // -------------------------------------------------------------------------

  describe('concurrent duplicate in-flight requests', () => {
    const KEY = 'idem-key-inflight';

    it('throws ConflictException when the same key is already being processed', async () => {
      // getResponse never resolves — simulates a slow handler holding the key
      let resolveFirst!: (v: null) => void;
      const slowPromise = new Promise<null>((res) => { resolveFirst = res; });
      mockIdempotencyService.getResponse
        .mockReturnValueOnce(slowPromise)       // first request hangs
        .mockResolvedValue(null);               // second should never reach this

      const { context: ctx1 } = makeContext({ idempotencyKey: KEY });
      const { context: ctx2 } = makeContext({ idempotencyKey: KEY });

      // Start first request but don't await — it is now in-flight
      const firstCall = guard.canActivate(ctx1);

      // Second concurrent call with the same key must throw immediately
      await expect(guard.canActivate(ctx2)).rejects.toThrow(ConflictException);

      // Clean up — let the first call finish
      resolveFirst(null);
      await firstCall;
    });
  });

  // -------------------------------------------------------------------------
  // d) Expired cache entry — IdempotencyService returns null, processes fresh
  // -------------------------------------------------------------------------

  describe('expired cached entry', () => {
    const KEY = 'idem-key-expired';
    const SCOPED = 'user-1:POST:/tasks:idem-key-expired';

    beforeEach(() => {
      // Service already handles expiry internally and returns null
      mockIdempotencyService.getResponse.mockResolvedValue(null);
      mockIdempotencyService.setResponse.mockResolvedValue(undefined);
    });

    it('treats the request as new (returns true) when cache is expired', async () => {
      const { context } = makeContext({ idempotencyKey: KEY });
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('wraps json() so the fresh result is persisted after handler runs', async () => {
      const { context, response } = makeContext({ idempotencyKey: KEY });
      await guard.canActivate(context);

      response.statusCode = 200;
      response.json({ recreated: true });
      await Promise.resolve();

      expect(mockIdempotencyService.setResponse).toHaveBeenCalledWith(
        SCOPED,
        'user-1',
        'POST:/tasks',
        200,
        { recreated: true },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('anonymous user (no request.user)', () => {
    it('scopes the key under "anonymous" when no user is attached', async () => {
      mockIdempotencyService.getResponse.mockResolvedValue(null);
      const { context } = makeContext({ idempotencyKey: 'anon-key', userId: '' });
      await guard.canActivate(context);
      expect(mockIdempotencyService.getResponse).toHaveBeenCalledWith(
        expect.stringContaining('anonymous:'),
      );
    });
  });

  describe('PUT and PATCH requests', () => {
    it.each(['PUT', 'PATCH', 'DELETE'])(
      'also honours the idempotency key for %s',
      async (method) => {
        mockIdempotencyService.getResponse.mockResolvedValue(null);
        const { context } = makeContext({ method, idempotencyKey: 'key-mut' });
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
        expect(mockIdempotencyService.getResponse).toHaveBeenCalled();
      },
    );
  });
});
