import { Module } from '@nestjs/common';
import { VisionModule } from '../../../vision/vision.module';
import { RecoveryEngineService } from './recovery-engine.service';
import { SelectorHealerService } from './selector-healer.service';
import { NavigationHealerService } from './navigation-healer.service';
import { WorkflowHealerService } from './workflow-healer.service';
import { RetryManagerService } from './retry-manager.service';

@Module({
  imports: [VisionModule],
  providers: [
    RecoveryEngineService,
    SelectorHealerService,
    NavigationHealerService,
    WorkflowHealerService,
    RetryManagerService,
  ],
  exports: [
    RecoveryEngineService,
    RetryManagerService,
  ],
})
export class SelfHealingRuntimeModule {}
