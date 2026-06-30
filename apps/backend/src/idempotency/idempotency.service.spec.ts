import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  idempotencyKey: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<IdempotencyService>(IdempotencyService);
  });

  describe('getResponse', () => {
    it('should return null when key not found', async () => {
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
      const result = await service.getResponse('u1:/api/test:key-1');
      expect(result).toBeNull();
    });

    it('should return response when key exists and not expired', async () => {
      const future = new Date(Date.now() + 3600000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        id: 'u1:/api/test:key-1',
        statusCode: 200,
        response: { success: true },
        expiresAt: future,
      });
      const result = await service.getResponse('u1:/api/test:key-1');
      expect(result).toEqual({ statusCode: 200, body: { success: true } });
    });

    it('should delete and return null when key expired', async () => {
      const past = new Date(Date.now() - 3600000);
      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        id: 'u1:/api/test:key-1',
        statusCode: 200,
        response: {},
        expiresAt: past,
      });
      const result = await service.getResponse('u1:/api/test:key-1');
      expect(result).toBeNull();
      expect(mockPrisma.idempotencyKey.delete).toHaveBeenCalledWith({ where: { id: 'u1:/api/test:key-1' } });
    });
  });

  describe('setResponse', () => {
    it('should upsert response with TTL', async () => {
      mockPrisma.idempotencyKey.upsert.mockResolvedValue({});
      await service.setResponse('key-1', 'u1', '/api/test', 201, { id: '123' });
      expect(mockPrisma.idempotencyKey.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'key-1' },
          create: expect.objectContaining({
            id: 'key-1',
            userId: 'u1',
            route: '/api/test',
            statusCode: 201,
            response: { id: '123' },
          }),
          update: expect.objectContaining({
            statusCode: 201,
            response: { id: '123' },
          }),
        }),
      );
    });

    it('should set 24h TTL on new key', async () => {
      mockPrisma.idempotencyKey.upsert.mockResolvedValue({});
      await service.setResponse('key-2', 'u2', '/api/data', 200, {});
      const call = mockPrisma.idempotencyKey.upsert.mock.calls[0][0];
      const expiresAt = call.create.expiresAt.getTime();
      const now = Date.now();
      expect(expiresAt - now).toBeGreaterThan(80_000_000); // ~24h
      expect(expiresAt - now).toBeLessThan(90_000_000);
    });
  });

  describe('cleanup', () => {
    it('should delete expired keys', async () => {
      mockPrisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 5 });
      await service.cleanup();
      expect(mockPrisma.idempotencyKey.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { expiresAt: { lt: expect.any(Date) } },
        }),
      );
    });
  });
});
