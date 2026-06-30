import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Multi-Agent Orchestration (e2e)', () => {
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

    const email = `multi-agent-${Date.now()}@test.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'ValidPass1!', name: 'Multi Agent User' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Task Routing', () => {
    it('should create a travel task', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'book a flight from nyc to london next week' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.naturalLanguage).toContain('flight');
        });
    });

    it('should create a research task', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'find latest research papers on transformer architectures' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
        });
    });

    it('should create a shopping task', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'find a good deal on noise cancelling headphones' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
        });
    });

    it('should create a job search task', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'find senior backend engineer jobs in remote' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
        });
    });
  });

  describe('Session Isolation', () => {
    let secondToken: string;

    beforeAll(async () => {
      const email = `second-agent-${Date.now()}@test.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Second Agent User' });
      secondToken = res.body.accessToken;
    });

    it('should isolate sessions between users', async () => {
      const user1Res = await request(app.getHttpServer())
        .get('/agent/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const user2Res = await request(app.getHttpServer())
        .get('/agent/sessions')
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(200);

      const user1Ids = user1Res.body.map((s: any) => s.userId);
      const user2Ids = user2Res.body.map((s: any) => s.userId);

      for (const id of user1Ids) {
        expect(user2Ids).not.toContain(id);
      }
    });

    it('should isolate tasks between users', async () => {
      const user1Res = await request(app.getHttpServer())
        .get('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const user2Res = await request(app.getHttpServer())
        .get('/agent/tasks')
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(200);

      const user1Ids = user1Res.body.map((t: any) => t.userId);
      const user2Ids = user2Res.body.map((t: any) => t.userId);

      for (const id of user1Ids) {
        expect(user2Ids).not.toContain(id);
      }
    });
  });

  describe('Agent Memory', () => {
    it('should store cross-task context via memory sessions', async () => {
      await request(app.getHttpServer())
        .post('/memory/session')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'context across tasks' })
        .expect(201);
    });

    it('should retrieve memories across task types', async () => {
      const res = await request(app.getHttpServer())
        .get('/memory')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should search memory by content', async () => {
      const res = await request(app.getHttpServer())
        .get('/memory/search?q=task')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should filter memory by type', async () => {
      const res = await request(app.getHttpServer())
        .get('/memory/search?q=test&type=EPISODIC')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
