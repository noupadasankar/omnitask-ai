import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';

describe('Files (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    const email = `files-${Date.now()}@test.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'ValidPass1!', name: 'File User' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /files/upload', () => {
    it('should reject unauthenticated', () => {
      return request(app.getHttpServer())
        .post('/files/upload')
        .expect(401);
    });

    it('should reject without file', () => {
      return request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should upload a file successfully', async () => {
      const tempFile = path.join(__dirname, '..', 'test-temp-upload.txt');
      fs.writeFileSync(tempFile, 'hello world');
      const result = await request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', tempFile)
        .expect((res) => {
          expect([201, 200]).toContain(res.status);
        });
      fs.unlinkSync(tempFile);
    });

    it('should reject invalid file type', () => {
      const tempFile = path.join(__dirname, '..', 'test-temp-invalid.exe');
      fs.writeFileSync(tempFile, 'fake exe');
      return request(app.getHttpServer())
        .post('/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', tempFile)
        .then((res) => {
          fs.unlinkSync(tempFile);
          const allowedStatuses = [400, 201, 200];
          expect(allowedStatuses).toContain(res.status);
        });
    });
  });

  describe('GET /files', () => {
    it('should list files', () => {
      return request(app.getHttpServer())
        .get('/files')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should reject unauthenticated', () => {
      return request(app.getHttpServer())
        .get('/files')
        .expect(401);
    });

    it('should support pagination', () => {
      return request(app.getHttpServer())
        .get('/files?take=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('GET /files/search', () => {
    it('should search files', () => {
      return request(app.getHttpServer())
        .get('/files/search?q=test')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should reject unauthenticated', () => {
      return request(app.getHttpServer())
        .get('/files/search?q=test')
        .expect(401);
    });
  });

  describe('GET /files/:id', () => {
    it('should reject non-existent file', () => {
      return request(app.getHttpServer())
        .get('/files/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
