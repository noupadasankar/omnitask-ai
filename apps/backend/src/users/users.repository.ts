// apps/backend/src/users/users.repository.ts
//
// Data-access layer for users. Wraps the exact Prisma calls that used to live
// inline in users.service.ts, so the service can be tested against a mocked
// repository instead of a mocked PrismaClient. Only file in the module that
// touches Prisma.

import { injectable, inject } from 'inversify';
import type { PrismaClient } from '@prisma/client';
import { TYPES } from '../core/container';

// Reusable projection — mirrors the old UsersService.userSelect exactly.
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@injectable()
export class UsersRepository {
  constructor(@inject(TYPES.PrismaClient) private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.user.findMany({ select: userSelect });
  }

  // Full row — used for existence checks and email-ownership comparison.
  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  updateUser(id: string, data: { name?: string; email?: string; passwordHash?: string }) {
    return this.prisma.user.update({ where: { id }, data, select: userSelect });
  }

  deleteUser(id: string) {
    return this.prisma.user.delete({ where: { id }, select: userSelect });
  }
}
