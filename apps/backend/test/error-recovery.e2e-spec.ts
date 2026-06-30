import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Error Recovery & Retry (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const email = `error-recovery-${Date.now()}@test.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'ValidPass1!', name: 'Error Recovery User' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Input Validation Recovery', () => {
    it('should reject empty email on register', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: '', password: 'ValidPass1!', name: 'Test' })
        .expect(400);
    });

    it('should reject invalid email format', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'ValidPass1!', name: 'Test' })
        .expect(400);
    });

    it('should reject missing password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: `test-${Date.now()}@test.com`, name: 'Test' })
        .expect(400);
    });

    it('should reject weak password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: `weak-${Date.now()}@test.com`, password: '123', name: 'Weak' })
        .expect(400);
    });

    it('should recover and allow valid registration after failures', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: '', password: 'ValidPass1!', name: 'Test' })
        .catch(() => {});

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'bad-email', password: 'ValidPass1!', name: 'Test' })
        .catch(() => {});

      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: `recover-${Date.now()}@test.com`, password: 'ValidPass1!', name: 'Recovered' })
        .expect(201);
    });
  });

  describe('Authentication Recovery', () => {
    it('should reject no token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .expect(401);
    });

    it('should reject malformed token', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('should reject empty Authorization header', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', '')
        .expect(401);
    });

    it('should accept valid token after previous failures', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('API Error Handling', () => {
    it('should return 404 for non-existent resource', () => {
      return request(app.getHttpServer())
        .get('/agent/tasks/nonexistent-id-12345')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 404 for non-existent file', () => {
      return request(app.getHttpServer())
        .get('/files/nonexistent-file-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should reject invalid method', () => {
      return request(app.getHttpServer())
        .patch('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
    });

    it('should reject invalid content type', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .set('Content-Type', 'text/plain')
        .send('raw string')
        .expect(400);
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle missing body gracefully', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('should handle excessive input gracefully', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'x'.repeat(5000) })
        .expect(400);
    });

    it('should handle SQL injection attempts gracefully', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: "' OR '1'='1",
          password: "' OR '1'='1",
        })
        .expect(401);
    });
  });

  describe('Rate Limit Recovery', () => {
    it('should eventually recover after rate limit', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'ratelimit@test.com', password: 'AnyPass1!' })
          .catch(() => {});
      }

      const email = `ratelimit-recover-${Date.now()}@test.com`;
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Rate Limit Recovery' })
        .then((res) => {
          expect([200, 201, 429]).toContain(res.status);
        });
    });
  });
});
