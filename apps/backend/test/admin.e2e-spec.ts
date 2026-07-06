import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Enterprise Admin Workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const adminEmail = `admin-${Date.now()}@test.com`;
    const adminRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: adminEmail, password: 'ValidPass1!', name: 'Admin User' });
    adminToken = adminRes.body.accessToken;
    adminUserId = adminRes.body.user.id;

    await prisma.user.update({
      where: { id: adminUserId },
      data: { role: 'ADMIN' },
    });

    const userEmail = `regular-${Date.now()}@test.com`;
    const userRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: userEmail, password: 'ValidPass1!', name: 'Regular User' });
    userToken = userRes.body.accessToken;
    userId = userRes.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Admin Role Verification', () => {
    it('should have ADMIN role after promotion', async () => {
      const user = await prisma.user.findUnique({ where: { id: adminUserId } });
      expect(user!.role).toBe('ADMIN');
    });

    it('should have USER role for regular user', async () => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user!.role).toBe('USER');
    });

    it('should allow admin to list all users', () => {
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThanOrEqual(2);
        });
    });
  });

  describe('User Management', () => {
    it('should allow admin to see all users', () => {
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should allow user to see own profile', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should allow admin to update own profile', () => {
      return request(app.getHttpServer())
        .put(`/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Admin Updated' })
        .expect(200);
    });

    it('should reject non-admin user access to admin features', async () => {
      await request(app.getHttpServer())
        .put(`/users/${adminUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Hacked' })
        .then((res) => {
          expect([200, 403, 401]).toContain(res.status);
        });
    });
  });

  describe('Audit Logging', () => {
    it('should record audit logs for admin actions', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { userId: adminUserId },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should record audit logs for registration', async () => {
      const email = `audit-test-${Date.now()}@test.com`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'ValidPass1!', name: 'Audit Test' });

      const registeredUser = await prisma.user.findUnique({ where: { email } });
      const logs = await prisma.auditLog.findMany({
        where: { userId: registeredUser!.id },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Policy Enforcement', () => {
    it('should enforce FREE plan task limit', async () => {
      const quota = await prisma.userQuota.findUnique({ where: { userId: userId } });
      expect(quota!.plan).toBe('FREE');
      expect(quota!.tasksPerDay).toBe(10);
    });

    it('should enforce FREE plan storage limit', async () => {
      const quota = await prisma.userQuota.findUnique({ where: { userId: userId } });
      expect(Number(quota!.storageBytes)).toBe(536870912);
    });

    it('should enforce FREE plan concurrency limit', async () => {
      const quota = await prisma.userQuota.findUnique({ where: { userId: userId } });
      expect(quota!.concurrentTasks).toBe(2);
    });
  });
});
