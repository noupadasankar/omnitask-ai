// apps/backend/src/files/files.repository.ts
//
// Data-access layer for files. Wraps the exact Prisma calls that used to live
// inline in files.service.ts (create / findMany / findFirst / update / delete),
// so the service holds only file-IO + business logic and can be unit-tested
// against a mocked repository. Only file in the module that touches Prisma.
//
// Every File row leaving this repository is passed through serializeFile because
// the Prisma File.sizeBytes column is a BigInt, which JSON.stringify (and thus
// Express res.json) cannot serialize — sizeBytes becomes a string on the wire.

import { injectable, inject } from 'inversify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { TYPES } from '../core/container';

function serializeFile<T extends { sizeBytes: bigint }>(
  file: T,
): Omit<T, 'sizeBytes'> & { sizeBytes: string } {
  return { ...file, sizeBytes: file.sizeBytes.toString() };
}

export interface CreateFileData {
  userId: string;
  name: string;
  mimeType: string;
  sizeBytes: bigint;
  storageKey: string;
  bucketName: string;
  checksum: string;
  taskId?: string;
  metadata?: Prisma.InputJsonValue;
  tags: string[];
}

export interface UpdateFileData {
  name?: string;
  mimeType?: string;
  tags?: string[];
  metadata?: Prisma.InputJsonValue;
}

@injectable()
export class FilesRepository {
  constructor(@inject(TYPES.PrismaClient) private readonly prisma: PrismaClient) {}

  async create(data: CreateFileData) {
    const file = await this.prisma.file.create({
      data: {
        userId: data.userId,
        name: data.name,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        storageKey: data.storageKey,
        bucketName: data.bucketName,
        checksum: data.checksum,
        taskId: data.taskId,
        metadata: data.metadata,
        tags: data.tags,
      },
      include: { user: { select: { id: true, email: true, name: true } }, task: true },
    });
    return serializeFile(file);
  }

  // Fetches take+1-style pages: the caller passes the already-incremented take
  // and does the hasMore/slice itself (keeps the pagination policy in the service).
  async findManyByUser(userId: string, take: number, cursorId?: string) {
    const items = await this.prisma.file.findMany({
      take,
      skip: cursorId ? 1 : 0,
      cursor: cursorId ? { id: cursorId } : undefined,
      where: { userId },
      include: { user: { select: { id: true, email: true, name: true } }, task: true },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(serializeFile);
  }

  async findOneByUser(userId: string, id: string) {
    const file = await this.prisma.file.findFirst({
      where: { id, userId },
      include: { user: { select: { id: true, email: true, name: true } }, task: true },
    });
    return file ? serializeFile(file) : null;
  }

  async update(id: string, data: UpdateFileData) {
    const file = await this.prisma.file.update({
      where: { id },
      data,
      include: { user: { select: { id: true, email: true, name: true } }, task: true },
    });
    return serializeFile(file);
  }

  async remove(id: string) {
    const file = await this.prisma.file.delete({ where: { id } });
    return serializeFile(file);
  }
}
