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

  async findAll(userId: string) {
    return this.prisma.file.findMany({
      where: { userId },
      include: { user: true, task: true },
      orderBy: { createdAt: 'desc' },
    });
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
