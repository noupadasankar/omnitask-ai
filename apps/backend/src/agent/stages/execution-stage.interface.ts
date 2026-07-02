import { ExecutionContext } from './execution-context';

export interface IExecutionStage {
  execute(ctx: ExecutionContext): Promise<void>;
}
