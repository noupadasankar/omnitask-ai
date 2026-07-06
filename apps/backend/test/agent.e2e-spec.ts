import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Agent (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
  let taskId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const email = `agent-${Date.now()}@test.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'ValidPass1!', name: 'Agent User' });
    token = res.body.accessToken;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /agent/tasks', () => {
    it('should create a task', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'search for cheap flights' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.naturalLanguage).toContain('cheap flights');
          taskId = res.body.id;
        });
    });

    it('should reject empty goal', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: '' })
        .expect(400);
    });

    it('should reject unauthenticated', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .send({ goal: 'test' })
        .expect(401);
    });

    it('should reject goal exceeding max length', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'x'.repeat(5000) })
        .expect(400);
    });

    it('should reject missing goal field', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });
  });

  describe('GET /agent/tasks', () => {
    it('should list tasks', async () => {
      await request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'list test task' });

      return request(app.getHttpServer())
        .get('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should reject unauthenticated', () => {
      return request(app.getHttpServer())
        .get('/agent/tasks')
        .expect(401);
    });

    it('should support pagination params', () => {
      return request(app.getHttpServer())
        .get('/agent/tasks?take=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('GET /agent/tasks/:id', () => {
    it('should return task by id', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'get by id test' });
      const id = createRes.body.id;

      return request(app.getHttpServer())
        .get(`/agent/tasks/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(id);
        });
    });

    it('should return 404 for non-existent task', () => {
      return request(app.getHttpServer())
        .get('/agent/tasks/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('GET /agent/sessions', () => {
    it('should list sessions', () => {
      return request(app.getHttpServer())
        .get('/agent/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should reject unauthenticated', () => {
      return request(app.getHttpServer())
        .get('/agent/sessions')
        .expect(401);
    });
  });

  describe('GET /agent/memory', () => {
    it('should list agent memories', () => {
      return request(app.getHttpServer())
        .get('/agent/memory')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should reject unauthenticated', () => {
      return request(app.getHttpServer())
        .get('/agent/memory')
        .expect(401);
    });
  });
});
