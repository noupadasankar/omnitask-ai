// apps/backend/src/files/container.module.ts
//
// Binds files' repository/service into the shared root container. Loaded once
// from main.ts alongside the other migrated modules' container.module.ts files.

import { ContainerModule } from 'inversify';
import { TYPES } from '../core/container';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';

export const filesContainerModule = new ContainerModule(({ bind }) => {
  bind(TYPES.FilesRepository).to(FilesRepository).inSingletonScope();
  bind(TYPES.FilesService).to(FilesService).inSingletonScope();
});
