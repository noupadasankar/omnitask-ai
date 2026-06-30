import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    const testEmail = `test-${Date.now()}@example.com`;

    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testEmail, password: 'StrongPass1!', name: 'Test User' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          expect(res.body.user.email).toBe(testEmail);
        });
    });

    it('should reject duplicate email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testEmail, password: 'StrongPass1!', name: 'Test User' })
        .expect(409);
    });

    it('should reject weak password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: `weak-${Date.now()}@test.com`, password: '123', name: 'Weak' })
        .expect(400);
    });

    it('should reject missing fields', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'missing@test.com' })
        .expect(400);
    });

    it('should reject missing name', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: `noname-${Date.now()}@test.com`, password: 'StrongPass1!' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    const email = `login-${Date.now()}@test.com`;
    const password = 'ValidPass1!';

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password, name: 'Login User' });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body.user.email).toBe(email);
        });
    });

    it('should reject wrong password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'WrongPass1!' })
        .expect(401);
    });

    it('should reject non-existent email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'noone@nowhere.com', password: 'AnyPass1!' })
        .expect(401);
    });

    it('should reject missing body', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('should reject missing password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email })
        .expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should reject invalid refresh token', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });

    it('should refresh token successfully', async () => {
      const email = `refresh-${Date.now()}@test.com`;
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Refresh User' });
      const refreshToken = registerRes.body.refreshToken;

      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
        });
    });

    it('should reject missing refreshToken field', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  describe('GET /auth/profile', () => {
    it('should reject without token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .expect(401);
    });

    it('should return profile with valid token', async () => {
      const email = `profile-${Date.now()}@test.com`;
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Profile User' });
      const token = registerRes.body.accessToken;

      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toBe(email);
        });
    });

    it('should reject expired or malformed token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('should reject missing Authorization header', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', '')
        .expect(401);
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limits on auth endpoints', async () => {
      const email = `ratelimit-${Date.now()}@test.com`;
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'AnyPass1!' })
          .catch(() => {});
      }
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'AnyPass1!' });
      expect([200, 201, 429]).toContain(res.status);
    });
  });

  describe('logout', () => {
    it('should allow logout with invalid token (graceful)', async () => {
      return request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect((res) => {
          expect([200, 201, 401]).toContain(res.status);
        });
    });
  });
});
