// apps/backend/src/feedback/container.module.ts
//
// Binds feedback's repository/service into the shared root container.
// Loaded once from main.ts alongside the other migrated modules'
// container.module.ts files.

import { ContainerModule } from 'inversify';
import { TYPES } from '../core/container';
import { FeedbackRepository } from './feedback.repository';
import { FeedbackService } from './feedback.service';

export const feedbackContainerModule = new ContainerModule(({ bind }) => {
  bind(TYPES.FeedbackRepository).to(FeedbackRepository).inSingletonScope();
  bind(TYPES.FeedbackService).to(FeedbackService).inSingletonScope();
});
