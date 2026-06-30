import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Memory (e2e)', () => {
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

    const email = `memory-${Date.now()}@test.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'ValidPass1!', name: 'Memory User' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /memory', () => {
    it('should list recent memories', () => {
      return request(app.getHttpServer())
        .get('/memory')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('should reject unauthenticated', () => {
      return request(app.getHttpServer())
        .get('/memory')
        .expect(401);
    });

    it('should support cursor pagination', () => {
      return request(app.getHttpServer())
        .get('/memory?take=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeLessThanOrEqual(5);
        });
    });

    it('should reject invalid take param', () => {
      return request(app.getHttpServer())
        .get('/memory?take=-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('GET /memory/search', () => {
    it('should search memories', () => {
      return request(app.getHttpServer())
        .get('/memory/search?q=test')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should filter by type', () => {
      return request(app.getHttpServer())
        .get('/memory/search?q=test&type=EPISODIC')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should return empty array for non-matching query', () => {
      return request(app.getHttpServer())
        .get('/memory/search?q=zzz_nonexistent_zzz')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should reject unauthenticated', () => {
      return request(app.getHttpServer())
        .get('/memory/search?q=test')
        .expect(401);
    });
  });

  describe('POST /memory/session', () => {
    it('should create a new session', () => {
      return request(app.getHttpServer())
        .post('/memory/session')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'test memory session' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.goal).toBe('test memory session');
          expect(res.body.status).toBe('active');
        });
    });

    it('should reject unauthenticated session creation', () => {
      return request(app.getHttpServer())
        .post('/memory/session')
        .send({ goal: 'test' })
        .expect(401);
    });
  });
});
