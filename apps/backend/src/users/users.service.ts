import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // 📦 Reusable select (clean architecture)
  private userSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    createdAt: true,
    updatedAt: true,
  };

  private userCacheKey(id: string): string {
    return `user:${id}`;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: this.userSelect,
    });
  }

  async findOne(id: string) {
    const cacheKey = this.userCacheKey(id);
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.userSelect,
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.cache.set(cacheKey, user, 300_000);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const data: any = {};

    // 👤 Basic fields
    if (updateUserDto.name !== undefined) {
      data.name = updateUserDto.name;
    }

    // 📧 Email uniqueness check
    if (updateUserDto.email !== undefined) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (existingUser && existingUser.id !== id) {
        throw new BadRequestException('Email already in use');
      }

      data.email = updateUserDto.email;
    }

    // 🔐 Password update (FIXED FIELD)
    if (updateUserDto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(updateUserDto.password, 10);
    }

    const result = await this.prisma.user.update({
      where: { id },
      data,
      select: this.userSelect,
    });

    await this.cache.del(this.userCacheKey(id));
    return result;
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const result = await this.prisma.user.delete({
      where: { id },
      select: this.userSelect,
    });

    await this.cache.del(this.userCacheKey(id));
    return result;
  }
}