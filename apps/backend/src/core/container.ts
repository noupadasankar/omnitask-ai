// apps/backend/src/core/container.ts
//
// Root Inversify container for modules that have been migrated off NestJS's
// decorator-based DI. Each migrated module owns a `container.module.ts` that
// binds its repository/service classes here via `bindModule()`.
//
// This container is intentionally separate from Nest's own DI graph — the two
// coexist during the migration (see MIGRATION-PLAN.md at the repo root).
// Migrated routes are mounted as plain Express sub-routers in main.ts and
// resolve their dependencies from this container instead of Nest's.

import 'reflect-metadata';
import { Container, type ContainerModule } from 'inversify';

/**
 * Central symbol registry for injectable bindings. Add one entry per
 * repository/service as modules are migrated — keeps `@inject(TYPES.Foo)`
 * call sites typo-proof and greppable.
 */
export const TYPES = {
  PrismaClient: Symbol.for('PrismaClient'),

  // feedback/
  FeedbackRepository: Symbol.for('FeedbackRepository'),
  FeedbackService: Symbol.for('FeedbackService'),

  // ab-testing/
  AbTestingRepository: Symbol.for('AbTestingRepository'),
  AbTestingService: Symbol.for('AbTestingService'),

  // users/
  UsersRepository: Symbol.for('UsersRepository'),
  UsersService: Symbol.for('UsersService'),

  // files/
  FilesRepository: Symbol.for('FilesRepository'),
  FilesService: Symbol.for('FilesService'),
} as const;

export const container = new Container({ defaultScope: 'Singleton' });

/** Load one or more module-local Inversify `ContainerModule`s into the root container. */
export async function bindModule(...modules: ContainerModule[]): Promise<void> {
  await container.load(...modules);
}
