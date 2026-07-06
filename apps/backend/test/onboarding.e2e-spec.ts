import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Onboarding Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Step 1: Health Check', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
          expect(res.body.status).toBe('ok');
        });
    });
  });

  describe('Step 2: User Registration', () => {
    const email = `onboard-${Date.now()}@example.com`;
    let accessToken: string;
    let userId: string;

    it('should register with valid data', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Onboarding User' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          expect(res.body.user.email).toBe(email);
          expect(res.body.user.role).toBe('USER');
          accessToken = res.body.accessToken;
          userId = res.body.user.id;
        });
    });

    it('should create FREE plan quota on registration', async () => {
      const quota = await prisma.userQuota.findUnique({ where: { userId } });
      expect(quota).not.toBeNull();
      expect(quota!.plan).toBe('FREE');
      expect(quota!.tasksPerDay).toBe(10);
    });

    it('should create preferences on registration', async () => {
      const prefs = await prisma.userPreferences.findUnique({ where: { userId } });
      expect(prefs).not.toBeNull();
    });
  });

  describe('Step 3: Profile Setup', () => {
    let token: string;
    let userId: string;

    beforeAll(async () => {
      const email = `profile-setup-${Date.now()}@test.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Profile Setup' });
      token = res.body.accessToken;
      userId = res.body.user.id;
    });

    it('should retrieve profile', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toContain('profile-setup');
          expect(res.body.role).toBe('USER');
        });
    });

    it('should update profile name', () => {
      return request(app.getHttpServer())
        .put(`/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(200);
    });
  });

  describe('Step 4: First Task Creation', () => {
    let token: string;

    beforeAll(async () => {
      const email = `first-task-${Date.now()}@test.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'First Task' });
      token = res.body.accessToken;
    });

    it('should create a task', () => {
      return request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'find documentation for nestjs testing' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.naturalLanguage).toContain('testing');
          expect(res.body.status).toBe('PLANNING');
        });
    });

    it('should list tasks', async () => {
      const res = await request(app.getHttpServer())
        .get('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Step 5: Memory Session', () => {
    let token: string;

    beforeAll(async () => {
      const email = `memory-session-${Date.now()}@test.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Memory Session' });
      token = res.body.accessToken;
    });

    it('should create a memory session', () => {
      return request(app.getHttpServer())
        .post('/memory/session')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'onboarding tutorial session' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.goal).toBe('onboarding tutorial session');
          expect(res.body.status).toBe('active');
        });
    });

    it('should list recent memories', () => {
      return request(app.getHttpServer())
        .get('/memory')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });
  });

  describe('Step 6: Complete Onboarding Flow', () => {
    let token: string;

    beforeAll(async () => {
      const email = `full-onboard-${Date.now()}@test.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Full Onboard' });
      token = res.body.accessToken;
    });

    it('should access all core endpoints in sequence', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const taskRes = await request(app.getHttpServer())
        .post('/agent/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'learn about the platform' })
        .expect(201);

      const taskId = taskRes.body.id;
      await request(app.getHttpServer())
        .get(`/agent/tasks/${taskId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/agent/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/memory/session')
        .set('Authorization', `Bearer ${token}`)
        .send({ goal: 'continue learning' })
        .expect(201);
    });
  });
});
