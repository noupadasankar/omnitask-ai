// backend/src/shared/dto/execution.dto.ts

import { IsString, IsOptional, IsObject, IsEnum, IsBoolean, IsNumber, IsArray } from 'class-validator';

export class StartExecutionDto {
  @IsString()
  taskId!: string;

  @IsString()
  goal!: string;

  @IsOptional()
  @IsObject()
  config?: {
    headless?: boolean;
    viewport?: { width: number; height: number };
    proxy?: { server: string; username?: string; password?: string };
    maxRetries?: number;
    timeout?: number;
  };

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}

export class ExecuteGoalDto {
  @IsString()
  goal!: string;

  @IsEnum(['autonomous', 'approval_required', 'simulation'])
  mode!: 'autonomous' | 'approval_required' | 'simulation';

  @IsOptional()
  @IsNumber()
  maxBudget?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredSites?: string[];

  @IsOptional()
  @IsBoolean()
  allowPayments?: boolean;

  @IsOptional()
  @IsBoolean()
  allowLogin?: boolean;

  @IsOptional()
  @IsEnum(['conservative', 'balanced', 'aggressive'])
  profile?: 'conservative' | 'balanced' | 'aggressive';
}

export class ParseGoalDto {
  @IsString()
  goal!: string;
}

export class NaturalLanguageCommandDto {
  @IsString()
  command!: string;
}

export class CreateScheduleDto {
  @IsString()
  name!: string;

  @IsString()
  cronExpression!: string;

  @IsString()
  goal!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class ApprovalResponseDto {
  @IsString()
  approvalRequestId!: string;

  @IsEnum(['APPROVED', 'DENIED'])
  status!: 'APPROVED' | 'DENIED';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class StepOverrideDto {
  @IsString()
  sessionId!: string;

  @IsNumber()
  stepIndex!: number;

  @IsString()
  action!: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsString()
  value?: string;
}
