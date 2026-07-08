// apps/backend/src/ab-testing/container.module.ts
//
// Binds ab-testing's repository/service into the shared root container.
// Loaded once from main.ts alongside the other migrated modules'
// container.module.ts files.

import { ContainerModule } from 'inversify';
import { TYPES } from '../core/container';
import { AbTestingRepository } from './ab-testing.repository';
import { AbTestingService } from './ab-testing.service';

export const abTestingContainerModule = new ContainerModule(({ bind }) => {
  bind(TYPES.AbTestingRepository).to(AbTestingRepository).inSingletonScope();
  bind(TYPES.AbTestingService).to(AbTestingService).inSingletonScope();
});
