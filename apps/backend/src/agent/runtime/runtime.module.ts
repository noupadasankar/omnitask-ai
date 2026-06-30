import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { VisionModule } from '../../vision/vision.module';
import { SessionManagerService } from './session-manager.service';
import { ClarificationGateService } from './clarification-gate.service';
import { AutomationGateService } from './automation-gate.service';
import { WorkerDispatcherService } from './worker-dispatcher.service';
import { PythonBridgeService } from './python-bridge.service';
import { ExecutionGraphService } from './execution-graph.service';
import { SelfHealingRuntimeModule } from './self-healing/self-healing.module';
import { GoalUnderstandingService } from '../goal-understanding.service';

@Module({
  imports: [
    QueueModule,
    VisionModule,
    SelfHealingRuntimeModule,
    forwardRef(() => WebsocketModule),
  ],
  providers: [
    SessionManagerService,
    ClarificationGateService,
    AutomationGateService,
    WorkerDispatcherService,
    PythonBridgeService,
    ExecutionGraphService,
    GoalUnderstandingService,
  ],
  exports: [
    SessionManagerService,
    ClarificationGateService,
    AutomationGateService,
    WorkerDispatcherService,
    ExecutionGraphService,
    SelfHealingRuntimeModule,
    GoalUnderstandingService,
  ],
})
export class RuntimeModule {}
