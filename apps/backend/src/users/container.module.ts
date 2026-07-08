// apps/backend/src/users/container.module.ts
//
// Binds users' repository/service into the shared root container.
// Loaded once from main.ts alongside the other migrated modules'
// container.module.ts files.

import { ContainerModule } from 'inversify';
import { TYPES } from '../core/container';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

export const usersContainerModule = new ContainerModule(({ bind }) => {
  bind(TYPES.UsersRepository).to(UsersRepository).inSingletonScope();
  bind(TYPES.UsersService).to(UsersService).inSingletonScope();
});
