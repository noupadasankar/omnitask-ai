// apps/backend/src/users/users.service.ts
//
// Business logic for users — same behavior as the old NestJS UsersService,
// now injectable via Inversify and delegating persistence to UsersRepository.
//
// The old CacheService dependency was intentionally dropped: it only cached
// findOne() (which has no route/callers, so the cache key was never populated)
// and issued cache.del() no-ops in update/remove. Removing it changes no
// observable behavior — the service now depends on the repository only.

import { injectable, inject } from 'inversify';
import * as bcrypt from 'bcryptjs';
import { TYPES } from '../core/container';
import { HttpError } from '../core/http/error.middleware';
import { UsersRepository } from './users.repository';
import type { UpdateUserInput } from './users.model';

@injectable()
export class UsersService {
  constructor(
    @inject(TYPES.UsersRepository) private readonly repo: UsersRepository,
  ) {}

  findAll() {
    return this.repo.findAll();
  }

  async update(id: string, dto: UpdateUserInput) {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new HttpError(404, `User with ID ${id} not found`);
    }

    const data: { name?: string; email?: string; passwordHash?: string } = {};

    // 👤 Basic fields
    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    // 📧 Email uniqueness check
    if (dto.email !== undefined) {
      const existingUser = await this.repo.findByEmail(dto.email);
      if (existingUser && existingUser.id !== id) {
        throw new HttpError(400, 'Email already in use');
      }
      data.email = dto.email;
    }

    // 🔐 Password update (hashed to passwordHash)
    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.repo.updateUser(id, data);
  }

  async remove(id: string) {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new HttpError(404, `User with ID ${id} not found`);
    }
    return this.repo.deleteUser(id);
  }
}
