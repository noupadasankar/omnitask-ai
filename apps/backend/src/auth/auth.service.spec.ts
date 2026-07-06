import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  session: {
    create: jest.fn().mockResolvedValue({ refreshToken: 'rt' }),
    findUnique: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
  },
  oAuthAccount: {
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
};

const mockJwt = { sign: jest.fn(() => 'mock-access-token') };
const mockConfig = { get: jest.fn((key: string, def?: any) => def) };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should throw on non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@y.com', password: 'p' })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com', passwordHash: await bcrypt.hash('correct', 4) });
      await expect(service.login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com', name: 'Test', role: 'USER', passwordHash: await bcrypt.hash('pass', 4) });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      const result = await service.login({ email: 'a@b.com', password: 'pass' });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('a@b.com');
    });

    it('should write audit log on failed login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@y.com', password: 'p' })).rejects.toThrow();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'LOGIN_FAILED' }) }));
    });

    it('should write audit log on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com', name: 'T', role: 'USER', passwordHash: await bcrypt.hash('p', 4) });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      await service.login({ email: 'a@b.com', password: 'p' });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'LOGIN' }) }));
    });
  });

  describe('register', () => {
    it('should throw on duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1' });
      await expect(service.register({ email: 'dup@b.com', password: 'p', name: 'N' })).rejects.toThrow(ConflictException);
    });

    it('should create user, quota, and preferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u1', email: 'new@b.com', name: 'New', role: 'USER' });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      const result = await service.register({ email: 'new@b.com', password: 'str0ng!', name: 'New' });
      expect(result.user.email).toBe('new@b.com');
      expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'new@b.com' }) }));
    });

    it('should write audit log on register', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u2', email: 'u@b.com', name: 'U', role: 'USER' });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      await service.register({ email: 'u@b.com', password: 'p', name: 'U' });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'REGISTER' }) }));
    });

    it('should hash password with bcrypt', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u3', email: 'u3@b.com', name: 'U3', role: 'USER' });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      await service.register({ email: 'u3@b.com', password: 'myPassword123!', name: 'U3' });
      const call = mockPrisma.user.create.mock.calls[0][0];
      expect(call.data.passwordHash).not.toBe('myPassword123!');
      expect(call.data.passwordHash).toContain('$2a$');
    });

    it('should create quota with FREE plan and reset at midnight', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u4', email: 'u4@b.com', name: 'U4', role: 'USER' });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      await service.register({ email: 'u4@b.com', password: 'p', name: 'U4' });
      const { quota } = mockPrisma.user.create.mock.calls[0][0].data;
      expect(quota.create.plan).toBe('FREE');
    });
  });

  describe('refreshAccessToken', () => {
    it('should throw on invalid token', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);
      await expect(service.refreshAccessToken('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw on expired token', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({ id: 's1', refreshToken: 'rt', expiresAt: new Date('2020-01-01'), user: { id: 'u1', email: 'a@b.com', role: 'USER' } });
      await expect(service.refreshAccessToken('rt')).rejects.toThrow(UnauthorizedException);
    });

    it('should delete expired session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({ id: 's1', refreshToken: 'rt', expiresAt: new Date('2020-01-01'), user: { id: 'u1', email: 'a@b.com', role: 'USER' } });
      await expect(service.refreshAccessToken('rt')).rejects.toThrow();
      expect(mockPrisma.session.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });

    it('should rotate token on success', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({ id: 's1', refreshToken: 'rt', expiresAt: new Date('2030-01-01'), user: { id: 'u1', email: 'a@b.com', role: 'USER' } });
      const result = await service.refreshAccessToken('rt');
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeTruthy();
      expect(typeof result.refreshToken).toBe('string');
    });

    it('should delete old session after rotation', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({ id: 's1', refreshToken: 'rt', expiresAt: new Date('2030-01-01'), user: { id: 'u1', email: 'a@b.com', role: 'USER' } });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'new-rt' });
      await service.refreshAccessToken('rt');
      expect(mockPrisma.session.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });
  });

  describe('validateOAuthLogin', () => {
    it('should return tokens for existing linked account', async () => {
      mockPrisma.oAuthAccount.findUnique.mockResolvedValue({ user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'USER' } });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      const result = await service.validateOAuthLogin({ provider: 'google', providerUid: 'g1', email: 'a@b.com', name: 'A', accessToken: 'mock' });
      expect(result).toHaveProperty('accessToken');
    });

    it('should link to existing user by email', async () => {
      mockPrisma.oAuthAccount.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A', role: 'USER' });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      const result = await service.validateOAuthLogin({ provider: 'google', providerUid: 'g2', email: 'a@b.com', name: 'A', accessToken: 'mock' });
      expect(mockPrisma.oAuthAccount.create).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
    });

    it('should create brand new user via OAuth', async () => {
      mockPrisma.oAuthAccount.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u2', email: 'new@b.com', name: 'New', role: 'USER' });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      const result = await service.validateOAuthLogin({ provider: 'google', providerUid: 'g3', email: 'new@b.com', name: 'New', avatarUrl: 'https://av.at/1', accessToken: 'mock' });
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(result.user.email).toBe('new@b.com');
    });

    it('should mark emailVerified for OAuth-created users', async () => {
      mockPrisma.oAuthAccount.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u3', email: 'u@b.com', name: 'U', role: 'USER' });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      await service.validateOAuthLogin({ provider: 'google', providerUid: 'g4', email: 'u@b.com', name: 'U', accessToken: 'mock' });
      expect(mockPrisma.user.create.mock.calls[0][0].data.emailVerified).toBe(true);
    });
  });

  describe('getUserProfile', () => {
    it('should return user when found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A', role: 'USER' });
      const result = await service.getUserProfile('u1');
      expect(result.id).toBe('u1');
    });

    it('should throw when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserProfile('nonexistent')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('token generation', () => {
    it('should call jwtService.sign with correct payload', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'T', role: 'USER', passwordHash: await bcrypt.hash('p', 4) });
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      await service.login({ email: 'a@b.com', password: 'p' });
      expect(mockJwt.sign).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.com', role: 'USER' });
    });

    it('should store refresh token in session table', async () => {
      mockPrisma.session.create.mockResolvedValue({ refreshToken: 'rt' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'T', role: 'USER', passwordHash: await bcrypt.hash('p', 4) });
      await service.login({ email: 'a@b.com', password: 'p' });
      expect(mockPrisma.session.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'u1' }) }));
    });
  });

  describe('audit logging', () => {
    it('should not throw when audit log write fails', async () => {
      mockPrisma.auditLog.create.mockRejectedValue(new Error('DB down'));
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@y.com', password: 'p' })).rejects.toThrow(UnauthorizedException);
    });
  });
});
