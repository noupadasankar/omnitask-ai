// apps/backend/src/ab-testing/ab-testing.model.ts
//
// Zod schemas + inferred types for the ab-testing module. Replaces the old
// untyped `@Body() dto: any` on AbTestingController — that NestJS endpoint
// never actually validated its body since it had no class-validator DTO.
// validateBody(...) now enforces these shapes for real. The old CreateTestDto
// / RecordRunDto interfaces that lived in ab-testing.service.ts are folded in
// here. NO decorators.

import { z } from 'zod';

export const createTestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  strategyA: z.record(z.unknown()),
  strategyB: z.record(z.unknown()),
});

export type CreateTestInput = z.infer<typeof createTestSchema>;

export const recordRunSchema = z.object({
  variant: z.enum(['A', 'B']),
  success: z.boolean(),
  durationMs: z.number(),
});

export type RecordRunInput = z.infer<typeof recordRunSchema>;

// Shape of a StrategyTest row as consumed by the service. Mirrors the Prisma
// `strategyTest` model but keeps the service free of any '@prisma/client'
// dependency (same reasoning as feedback.model.ts's FeedbackRow).
export interface StrategyTestRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  strategyA: unknown;
  strategyB: unknown;
  status: string;
  winner: string | null;
  totalRunsA: number;
  totalRunsB: number;
  successA: number;
  successB: number;
  avgDurationA: number;
  avgDurationB: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Per-variant slice of the getResults() response — shape preserved exactly
// from the old AbTestingService.getResults().
export interface AbTestVariantResult {
  totalRuns: number;
  successes: number;
  successRate: number;
  avgDurationMs: number;
}

// Full getResults() response shape (preserved exactly from the old service).
export interface AbTestResults {
  id: string;
  name: string;
  status: string;
  winner: string | null;
  variantA: AbTestVariantResult;
  variantB: AbTestVariantResult;
  significance: number;
}
