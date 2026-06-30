import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFileDto, UpdateFileDto } from './dto/file.dto';
import { createHash, randomUUID } from 'crypto';

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createFileDto: CreateFileDto) {
    const storageKey = `${userId}/${randomUUID()}-${createFileDto.name}`;
    const checksum = createHash('sha256').update(storageKey).digest('hex');

    return this.prisma.file.create({
      data: {
        userId,
        name: createFileDto.name,
        mimeType: createFileDto.mimeType,
        sizeBytes: BigInt(createFileDto.sizeBytes),
        storageKey,
        bucketName: process.env.S3_BUCKET || 'omnitask-files',
        checksum,
        taskId: createFileDto.taskId,
        metadata: createFileDto.metadata as Prisma.InputJsonValue | undefined,
        tags: createFileDto.tags ?? [],
      },
      include: { user: true, task: true },
    });
  }

  async findAll(userId: string, cursor?: string, take: number = 20) {
    const pageSize = Math.min(take, 100);
    const decodedCursor = cursor
      ? (() => { try { return Buffer.from(cursor, 'base64url').toString('utf-8'); } catch { return undefined; } })()
      : undefined;

    const items = await this.prisma.file.findMany({
      take: pageSize + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      where: { userId },
      include: { user: true, task: true },
      orderBy: { createdAt: 'desc' },
    });

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
    const file = await this.prisma.file.findFirst({
      where: { id, userId },
      include: { user: true, task: true },
    });

    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }
    return file;
  }

  async update(userId: string, id: string, updateFileDto: UpdateFileDto) {
    await this.findOne(userId, id);

    const { metadata, ...rest } = updateFileDto;
    return this.prisma.file.update({
      where: { id },
      data: {
        ...rest,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
      include: { user: true, task: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.file.delete({ where: { id } });
  }
}
