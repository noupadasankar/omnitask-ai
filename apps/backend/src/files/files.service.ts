// apps/backend/src/files/files.service.ts
//
// Business logic for files — same behavior as the old NestJS FilesService
// (disk persistence, sha256 checksum, cursor pagination, ownership-scoped
// reads), now injectable via Inversify and delegating all persistence to
// FilesRepository. Holds no '@prisma/client' access beyond the InputJsonValue
// type used to cast the metadata column.

import { injectable, inject } from 'inversify';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TYPES } from '../core/container';
import { HttpError } from '../core/http/error.middleware';
import { FilesRepository } from './files.repository';
import type { CreateFileInput, UpdateFileInput, UploadedFile } from './files.model';

@injectable()
export class FilesService {
  constructor(@inject(TYPES.FilesRepository) private readonly repo: FilesRepository) {}

  /** Persist an uploaded file's bytes to disk and record it, scoped to the owning user. */
  async uploadAndCreate(userId: string, file: UploadedFile, taskId?: string) {
    const uploadsDir = path.join(__dirname, '../../uploads', userId);
    await fs.mkdir(uploadsDir, { recursive: true });
    const storageKey = `${userId}/${randomUUID()}-${file.originalname}`;
    const dest = path.join(__dirname, '../../uploads', storageKey);
    await fs.writeFile(dest, file.buffer);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    return this.repo.create({
      userId,
      name: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: BigInt(file.size),
      storageKey,
      bucketName: process.env.S3_BUCKET || 'omnitask-files',
      checksum,
      taskId,
      tags: [],
    });
  }

  async create(userId: string, dto: CreateFileInput) {
    const storageKey = `${userId}/${randomUUID()}-${dto.name}`;
    const checksum = createHash('sha256').update(storageKey).digest('hex');

    return this.repo.create({
      userId,
      name: dto.name,
      mimeType: dto.mimeType,
      sizeBytes: BigInt(dto.sizeBytes),
      storageKey,
      bucketName: process.env.S3_BUCKET || 'omnitask-files',
      checksum,
      taskId: dto.taskId,
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      tags: dto.tags ?? [],
    });
  }

  async findAll(userId: string, cursor?: string, take = 20) {
    const pageSize = Math.min(take, 100);
    const decodedCursor = cursor
      ? (() => {
          try {
            return Buffer.from(cursor, 'base64url').toString('utf-8');
          } catch {
            return undefined;
          }
        })()
      : undefined;

    const items = await this.repo.findManyByUser(userId, pageSize + 1, decodedCursor);

    const hasMore = items.length > pageSize;
    const data = hasMore ? items.slice(0, pageSize) : items;
    const last = data[data.length - 1];
    return {
      data,
      nextCursor: last && hasMore ? Buffer.from(last.id, 'utf-8').toString('base64url') : null,
      hasMore,
    };
  }

  async findOne(userId: string, id: string) {
    const file = await this.repo.findOneByUser(userId, id);
    if (!file) {
      throw new HttpError(404, `File with ID ${id} not found`);
    }
    return file;
  }

  async update(userId: string, id: string, dto: UpdateFileInput) {
    await this.findOne(userId, id);

    const { metadata, ...rest } = dto;
    return this.repo.update(id, {
      ...rest,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.repo.remove(id);
  }
}
