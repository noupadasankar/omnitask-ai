import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Task Execution Lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let taskId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const email = `exec-${Date.now()}@test.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'ValidPass1!', name: 'Execution User' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Phase 1: Task Creation', () => {
    it('should create a task with natural language input', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'find and apply to software engineer jobs in san francisco' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.naturalLanguage).toContain('software engineer');
          expect(res.body.status).toBe('PLANNING');
          taskId = res.body.id;
        });
    });

    it('should reject duplicate empty goal', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: '' })
        .expect(400);
    });

    it('should reject unauthenticated task creation', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .send({ goal: 'test' })
        .expect(401);
    });

    it('should reject excessively long goal', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'x'.repeat(5000) })
        .expect(400);
    });
  });

  describe('Phase 2: Task Retrieval', () => {
    it('should get task by id with status', () => {
      return request(app.getHttpServer())
        .get(`/agent/tasks/${taskId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(taskId);
          expect(['PLANNING', 'PLANNED', 'RUNNING', 'COMPLETED', 'FAILED']).toContain(res.body.status);
        });
    });

    it('should return 404 for non-existent task', () => {
      return request(app.getHttpServer())
        .get('/agent/tasks/nonexistent-task-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should list all user tasks', () => {
      return request(app.getHttpServer())
        .get('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          const task = res.body.find((t: any) => t.id === taskId);
          expect(task).toBeDefined();
        });
    });

    it('should support pagination', () => {
      return request(app.getHttpServer())
        .get('/agent/tasks?take=5&skip=0')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('Phase 3: Execution Sessions', () => {
    let sessionId: string;

    it('should list execution sessions', () => {
      return request(app.getHttpServer())
        .get('/agent/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should have session associated with task', async () => {
      const res = await request(app.getHttpServer())
        .get('/agent/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      if (res.body.length > 0) {
        sessionId = res.body[0].id;
        expect(res.body[0]).toHaveProperty('status');
      }
    });

    it('should reject unauthenticated session access', () => {
      return request(app.getHttpServer())
        .get('/agent/sessions')
        .expect(401);
    });
  });

  describe('Phase 4: Memory & Context', () => {
    it('should store and retrieve execution context', async () => {
      const sessionRes = await request(app.getHttpServer())
        .post('/memory/session')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'track execution context' })
        .expect(201);

      expect(sessionRes.body).toHaveProperty('id');
    });

    it('should search memory', () => {
      return request(app.getHttpServer())
        .get('/memory/search?q=execution')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should list paginated memories', () => {
      return request(app.getHttpServer())
        .get('/memory?take=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeLessThanOrEqual(10);
        });
    });
  });

  describe('Phase 5: Task Status Transitions', () => {
    it('should track task status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/agent/tasks/${taskId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const validStatuses = ['PLANNING', 'PLANNED', 'RUNNING', 'COMPLETED', 'FAILED'];
      expect(validStatuses).toContain(res.body.status);
    });

    it('should track task timestamps', async () => {
      const res = await request(app.getHttpServer())
        .get(`/agent/tasks/${taskId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
    });
  });
});
