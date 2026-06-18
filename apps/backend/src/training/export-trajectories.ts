/**
 * export-trajectories.ts — the read-only half of the training data lake.
 *
 * Pulls GOLD + DEMONSTRATION trajectories from Postgres and writes one ChatML
 * JSON object per reasoning step to a JSONL file. This is the bridge between the
 * captured (state -> decision) pairs (TrajectoryStep) and an offline QLoRA run:
 * the trainer (Python, later) just streams this JSONL — it never touches the DB.
 *
 * No training happens here and no heavy deps are pulled — it's a plain Prisma
 * read + file write, runnable with the same ts-node toolchain as prisma/seed.ts.
 *
 * Run:
 *   pnpm --filter backend train:export            # default out: data/training/trajectories.jsonl
 *   ts-node src/training/export-trajectories.ts ./out.jsonl GOLD,DEMONSTRATION
 *
 * Each line is: { messages: [{role:"system"},{role:"user"},{role:"assistant"}],
 *                 meta: { sessionId, stepIndex, domain, grade } }
 * where the assistant turn is the model's own decision JSON — i.e. the label.
 */

import { PrismaClient, TrajectoryGrade } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Mirrors the reasoning core's framing so fine-tuning reinforces the same
// instruction the live agent uses. Kept terse — the signal is goal+observation
// -> action, not prose.
const SYSTEM_PROMPT =
  'You are the reasoning core of an autonomous web agent. Given the GOAL and the ' +
  'current page OBSERVATION (interactive elements tagged [ref]), reply with EXACTLY ' +
  'one JSON object: {"thought":...,"assessment":{...},"action":{"tool":...}}.';

function parseArgs(): { outPath: string; grades: TrajectoryGrade[] } {
  const outArg = process.argv[2] || 'data/training/trajectories.jsonl';
  const gradesArg = process.argv[3] || 'GOLD,DEMONSTRATION';
  const grades = gradesArg
    .split(',')
    .map((g) => g.trim().toUpperCase())
    .filter((g): g is TrajectoryGrade => g in TrajectoryGrade);
  return { outPath: path.resolve(outArg), grades };
}

function buildChatmlLine(
  step: {
    stepIndex: number;
    goal: string | null;
    domain: string | null;
    observation: string | null;
    decision: unknown;
  },
  ctx: { sessionId: string; grade: TrajectoryGrade },
): string | null {
  // The decision JSON is the training target; skip steps that never captured one.
  if (!step.decision || typeof step.decision !== 'object') return null;

  const userContent =
    `GOAL: ${step.goal ?? '(unknown)'}\n\n` +
    `CURRENT OBSERVATION:\n${step.observation ?? '(none captured)'}`;

  const record = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
      { role: 'assistant', content: JSON.stringify(step.decision) },
    ],
    meta: {
      sessionId: ctx.sessionId,
      stepIndex: step.stepIndex,
      domain: step.domain ?? null,
      grade: ctx.grade,
    },
  };
  return JSON.stringify(record);
}

async function main(): Promise<void> {
  const { outPath, grades } = parseArgs();
  if (grades.length === 0) {
    throw new Error(
      'No valid grades requested. Use a comma list of: GOLD, DEMONSTRATION, REJECTED, UNGRADED.',
    );
  }

  const runs = await prisma.trajectoryRun.findMany({
    where: { grade: { in: grades } },
    select: { sessionId: true, grade: true },
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { encoding: 'utf-8' });

  let sessions = 0;
  let examples = 0;
  try {
    for (const run of runs) {
      const steps = await prisma.trajectoryStep.findMany({
        where: { sessionId: run.sessionId },
        orderBy: { stepIndex: 'asc' },
        select: {
          stepIndex: true,
          goal: true,
          domain: true,
          observation: true,
          decision: true,
        },
      });
      let wroteForSession = 0;
      for (const step of steps) {
        const line = buildChatmlLine(step, {
          sessionId: run.sessionId,
          grade: run.grade,
        });
        if (line) {
          out.write(line + '\n');
          examples++;
          wroteForSession++;
        }
      }
      if (wroteForSession > 0) sessions++;
    }
  } finally {
    out.end();
  }

  // eslint-disable-next-line no-console
  console.log(
    `[train:export] Wrote ${examples} ChatML examples from ${sessions} graded ` +
      `session(s) [${grades.join(', ')}] → ${outPath}`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[train:export] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
