import { Test, TestingModule } from '@nestjs/testing';
import { VaultService } from './vault.service';
import { PrismaService } from '../prisma/prisma.service';

const OLD_ENV = process.env;

const mockPrisma = {
  credentialVault: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
};

describe('VaultService', () => {
  let service: VaultService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, VAULT_MASTER_KEY: 'a'.repeat(64) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<VaultService>(VaultService);
  });

  afterAll(() => { process.env = OLD_ENV; });

  describe('initialization', () => {
    it('should throw if VAULT_MASTER_KEY is missing', () => {
      delete process.env.VAULT_MASTER_KEY;
      expect(() => new VaultService(mockPrisma as any)).toThrow('VAULT_MASTER_KEY');
    });

    it('should throw if key is wrong length', () => {
      process.env.VAULT_MASTER_KEY = 'not64chars';
      expect(() => new VaultService(mockPrisma as any)).toThrow('64 hex characters');
    });
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a string', () => {
      const payload = service.encrypt('hello-world');
      expect(payload).toHaveProperty('ciphertext');
      expect(payload).toHaveProperty('iv');
      expect(payload).toHaveProperty('tag');
      expect(payload).toHaveProperty('salt');
      const decrypted = service.decrypt(payload);
      expect(decrypted).toBe('hello-world');
    });

    it('should produce different ciphertexts for same input', () => {
      const a = service.encrypt('same');
      const b = service.encrypt('same');
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it('should handle empty string', () => {
      const payload = service.encrypt('');
      expect(service.decrypt(payload)).toBe('');
    });

    it('should handle special characters', () => {
      const input = 'héllo wörld 🔐 $pecial!@#';
      const payload = service.encrypt(input);
      expect(service.decrypt(payload)).toBe(input);
    });

    it('should throw on tampered ciphertext', () => {
      const payload = service.encrypt('secret');
      payload.ciphertext = payload.ciphertext.replace(/^.{4}/, 'dead');
      expect(() => service.decrypt(payload)).toThrow();
    });

    it('should throw on tampered tag', () => {
      const payload = service.encrypt('secret');
      payload.tag = '0'.repeat(32);
      expect(() => service.decrypt(payload)).toThrow();
    });
  });

  describe('storeCredential', () => {
    it('should store encrypted credential', async () => {
      mockPrisma.credentialVault.upsert.mockResolvedValue({ id: 'v1', service: 'github', label: 'GH', hints: 'user: admin', expiresAt: null, createdAt: new Date() });
      const result = await service.storeCredential('u1', 'github', 'GH', { token: 'ghp_xxx' }, 'user: admin');
      expect(result.service).toBe('github');
      expect(mockPrisma.credentialVault.upsert).toHaveBeenCalled();
    });

    it('should encrypt before storing', async () => {
      mockPrisma.credentialVault.upsert.mockResolvedValue({ id: 'v2', service: 'aws', label: 'AWS', hints: null, expiresAt: null, createdAt: new Date() });
      await service.storeCredential('u1', 'aws', 'AWS', { key: 'AKI...', secret: 'abc123' });
      expect(mockPrisma.credentialVault.upsert).toHaveBeenCalled();
      const callArgs = mockPrisma.credentialVault.upsert.mock.calls[0][0];
      const encrypted = callArgs.create.encrypted;
      expect(encrypted).toHaveProperty('ciphertext');
      expect(typeof encrypted.ciphertext).toBe('string');
    });
  });

  describe('getCredential', () => {
    it('should return null for missing credential', async () => {
      mockPrisma.credentialVault.findUnique.mockResolvedValue(null);
      const result = await service.getCredential('u1', 'unknown');
      expect(result).toBeNull();
    });

    it('should decrypt and return credentials', async () => {
      const encrypted = service.encrypt(JSON.stringify({ token: 'secret-123' }));
      mockPrisma.credentialVault.findUnique.mockResolvedValue({ encrypted: encrypted as any });
      const result = await service.getCredential('u1', 'test');
      expect(result).toEqual({ token: 'secret-123' });
    });

    it('should return null on corrupt data', async () => {
      mockPrisma.credentialVault.findUnique.mockResolvedValue({ encrypted: { ciphertext: 'bad', iv: 'bad', tag: 'bad', salt: 'bad' } });
      const result = await service.getCredential('u1', 'corrupt');
      expect(result).toBeNull();
    });
  });

  describe('listCredentials', () => {
    it('should return list without exposing encrypted data', async () => {
      mockPrisma.credentialVault.findMany.mockResolvedValue([
        { id: 'v1', service: 'g', label: 'G', hints: null, expiresAt: null, createdAt: new Date(), encrypted: { ciphertext: 'secret' } },
      ]);
      const result = await service.listCredentials('u1');
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('encrypted');
    });

    it('should return empty array when no credentials', async () => {
      mockPrisma.credentialVault.findMany.mockResolvedValue([]);
      const result = await service.listCredentials('u1');
      expect(result).toEqual([]);
    });
  });

  describe('deleteCredential', () => {
    it('should delete by composite key', async () => {
      mockPrisma.credentialVault.delete.mockResolvedValue({});
      await service.deleteCredential('u1', 'github');
      expect(mockPrisma.credentialVault.delete).toHaveBeenCalledWith({ where: { userId_service: { userId: 'u1', service: 'github' } } });
    });
  });
});
