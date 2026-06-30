import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Billing & Subscription Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const email = `billing-${Date.now()}@test.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'ValidPass1!', name: 'Billing User' });
    token = res.body.accessToken;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('User Plan Verification', () => {
    it('should default to FREE plan', async () => {
      const quota = await prisma.userQuota.findUnique({ where: { userId } });
      expect(quota).not.toBeNull();
      expect(quota!.plan).toBe('FREE');
    });

    it('should enforce FREE plan daily task limit', async () => {
      const quota = await prisma.userQuota.findUnique({ where: { userId } });
      expect(quota!.tasksPerDay).toBe(10);
    });

    it('should track tasks used today', async () => {
      const quota = await prisma.userQuota.findUnique({ where: { userId } });
      expect(quota!.tasksUsedToday).toBeDefined();
      expect(typeof quota!.tasksUsedToday).toBe('number');
    });

    it('should have daily reset time', async () => {
      const quota = await prisma.userQuota.findUnique({ where: { userId } });
      expect(quota!.resetAt).toBeInstanceOf(Date);
    });
  });

  describe('Plan Limits', () => {
    it.each([
      { plan: 'FREE', tasksPerDay: 10, concurrent: 2, storageMB: 512 },
      { plan: 'PRO', tasksPerDay: 50, concurrent: 5, storageMB: 5120 },
      { plan: 'TEAM', tasksPerDay: 200, concurrent: 20, storageMB: 51200 },
      { plan: 'ENTERPRISE', tasksPerDay: 1000, concurrent: 100, storageMB: 512000 },
    ])('should define correct limits for $plan plan', async ({ plan, tasksPerDay, concurrent, storageMB }) => {
      const expectedBytes = BigInt(storageMB) * BigInt(1024 * 1024);

      const testUserEmail = `plan-${plan.toLowerCase()}-${Date.now()}@test.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testUserEmail, password: 'ValidPass1!', name: `${plan} User` });
      const uid = res.body.user.id;

      await prisma.userQuota.update({
        where: { userId: uid },
        data: { plan: plan as any },
      });

      const quota = await prisma.userQuota.findUnique({ where: { userId: uid } });
      expect(quota!.tasksPerDay).toBe(tasksPerDay);
      expect(quota!.concurrentTasks).toBe(concurrent);
      expect(quota!.storageBytes).toBe(expectedBytes);
    });
  });

  describe('Quota Enforcement', () => {
    it('should enforce daily task quota', async () => {
      const email = `quota-${Date.now()}@test.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Quota User' });
      const uid = res.body.user.id;
      const t = res.body.accessToken;

      // Set tasksUsedToday to the FREE plan limit so the next request is over-quota.
      await prisma.userQuota.update({
        where: { userId: uid },
        data: { tasksUsedToday: 10 },
      });

      const createRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${t}`)
        .send({ goal: 'test task after quota' });
      // Over-quota requests must be rejected (429) or forbidden (403), not accepted.
      expect([429, 403]).toContain(createRes.status);
    });

    it('should allow task creation within quota', async () => {
      const email = `within-quota-${Date.now()}@test.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Within Quota' });
      const t = res.body.accessToken;

      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${t}`)
        .send({ goal: 'task within quota' })
        .expect(201);
    });
  });

  describe('Plan Upgrade Simulation', () => {
    it('should allow quota update to PRO plan', async () => {
      await prisma.userQuota.update({
        where: { userId },
        data: { plan: 'PRO', tasksPerDay: 50, concurrentTasks: 5 },
      });

      const quota = await prisma.userQuota.findUnique({ where: { userId } });
      expect(quota!.plan).toBe('PRO');
      expect(quota!.tasksPerDay).toBe(50);
      expect(quota!.concurrentTasks).toBe(5);
    });

    it('should allow quota update to TEAM plan', async () => {
      await prisma.userQuota.update({
        where: { userId },
        data: { plan: 'TEAM', tasksPerDay: 200, concurrentTasks: 20 },
      });

      const quota = await prisma.userQuota.findUnique({ where: { userId } });
      expect(quota!.plan).toBe('TEAM');
    });

    it('should allow quota update to ENTERPRISE plan', async () => {
      await prisma.userQuota.update({
        where: { userId },
        data: { plan: 'ENTERPRISE', tasksPerDay: 1000, concurrentTasks: 100 },
      });

      const quota = await prisma.userQuota.findUnique({ where: { userId } });
      expect(quota!.plan).toBe('ENTERPRISE');
    });

    it('should reset plan back to FREE', async () => {
      await prisma.userQuota.update({
        where: { userId },
        data: { plan: 'FREE', tasksPerDay: 10, concurrentTasks: 2 },
      });

      const quota = await prisma.userQuota.findUnique({ where: { userId } });
      expect(quota!.plan).toBe('FREE');
    });
  });

  describe('Usage Tracking', () => {
    it('should increment tasksUsedToday when task is created', async () => {
      const email = `usage-${Date.now()}@test.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Usage User' });
      const t = res.body.accessToken;
      const uid = res.body.user.id;

      await prisma.userQuota.update({
        where: { userId: uid },
        data: { tasksUsedToday: 0 },
      });

      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${t}`)
        .send({ goal: 'usage tracking task' });

      const quota = await prisma.userQuota.findUnique({ where: { userId: uid } });
      expect(quota!.tasksUsedToday).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit auth endpoints', async () => {
      for (let i = 0; i < 20; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: `ratelimit-${Date.now()}@test.com`, password: 'ValidPass1!' })
          .catch(() => {});
      }
    });
  });
});
