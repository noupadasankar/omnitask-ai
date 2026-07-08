// apps/backend/src/core/container-bootstrap.ts
//
// Loads shared bindings (PrismaClient) plus every migrated module's
// container.module.ts into the root container. Call once from main.ts
// before mounting any migrated Express router.

import { ContainerModule } from 'inversify';
import { bindModule, TYPES } from './container';
import { getPrismaClient } from './db/prisma';
import { feedbackContainerModule } from '../feedback/container.module';
import { abTestingContainerModule } from '../ab-testing/container.module';
import { usersContainerModule } from '../users/container.module';
import { filesContainerModule } from '../files/container.module';

const coreContainerModule = new ContainerModule(({ bind }) => {
  bind(TYPES.PrismaClient).toDynamicValue(() => getPrismaClient()).inSingletonScope();
});

export async function bootstrapContainer(): Promise<void> {
  await bindModule(
    coreContainerModule,
    feedbackContainerModule,
    abTestingContainerModule,
    usersContainerModule,
    filesContainerModule,
  );
}
