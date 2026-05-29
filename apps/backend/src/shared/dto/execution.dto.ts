// backend/src/shared/dto/execution.dto.ts

import { IsString, IsOptional, IsObject, IsEnum, IsBoolean, IsNumber } from 'class-validator';

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
