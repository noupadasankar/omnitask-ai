// backend/src/agent/verifier-agent.service.ts
//
// The VerifierAgent is the cognitive "did we actually do what was asked?" layer.
// After every execution, it compares the original parsed goal vs what happened
// and decides: accept | retry | replan | notify_user.
// This is what separates a task executor from a cognitive operating system.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AgentPlan, PlannedStep } from '../shared/interfaces/agent.interfaces';
import { ParsedGoal } from './goal-understanding.service';

export type VerificationNextAction = 'accept' | 'retry' | 'replan' | 'notify_user';

export interface VerificationEvidence {
  sitesTested: string[];
  actionsCount: Record<string, number>;
  artifactsCreated: string[];
}

export interface VerificationResult {
  verified: boolean;
  confidence: number; // 0.0 → 1.0
  score: number;      // 0 → 100
  summary: string;    // Human-readable verdict
  evidence: VerificationEvidence;
  gaps: string[];     // What the agent failed to achieve
  achievements: string[]; // What the agent DID achieve
  nextAction: VerificationNextAction;
  reasoning: string;
}

export interface ExecutionSummary {
  goal: string;
  parsedGoal?: ParsedGoal;
  plan: AgentPlan;
  stepsCompleted: number;
  stepsFailed: number;
  totalSteps: number;
  finalPageUrl?: string;
  extractedData?: any;
  errorHistory: string[];
  durationMs: number;
  matchedPluginIds?: string[];
}

@Injectable()
export class VerifierAgentService {
  private readonly logger = new Logger(VerifierAgentService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Core verification: did this execution satisfy user intent?
   * Returns structured evidence, confidence, and gaps.
   */
  async verify(summary: ExecutionSummary): Promise<VerificationResult> {
    this.logger.log(`VerifierAgent evaluating execution for goal: "${summary.goal}"`);

    const completionRate = summary.totalSteps > 0
      ? Math.round((summary.stepsCompleted / summary.totalSteps) * 100)
      : 0;

    const systemPrompt = `You are a senior autonomous AI systems verifier. Your job is to determine if an AI agent's execution actually satisfied the original user intent.

You must think critically:
- The agent may have completed all steps but still not achieved the goal (e.g. navigated but failed to apply/submit)
- Identify specifically what was achieved and what was missed.
- Construct the "evidence" mapping summarizing tested sites, counts of steps per site/plugin, and list of files or records created.

Scoring guide:
- 90-100: Goal fully achieved, output matches intent completely
- 70-89: Goal mostly achieved, minor gaps
- 50-69: Goal partially achieved, significant gaps
- 0-49: Goal failed or wrong outcome

Next action guide:
- "accept": score >= 80, no critical gaps
- "retry": score 50-79, same plan can recover with retry
- "replan": score < 50 or fundamental approach was wrong
- "notify_user": goal required human data (login credentials, OTP, payment) that was blocked

Output strict JSON only:
{
  "verified": boolean,
  "confidence": 0.0-1.0,
  "score": 0-100,
  "summary": "One sentence verdict",
  "evidence": {
    "sitesTested": ["list of website domains/names actually tested/used"],
    "actionsCount": { "linkedin": 4, "indeed": 5, "swiggy": 2 }, // mapping of site/plugin names to count of steps run on them
    "artifactsCreated": ["list of artifacts, screenshots, receipts, or job application names created"]
  },
  "gaps": ["What was NOT achieved, specific and actionable"],
  "achievements": ["What WAS successfully accomplished"],
  "nextAction": "accept|retry|replan|notify_user",
  "reasoning": "Your step-by-step reasoning for the score, evidence, and next action"
}`;

    const userPrompt = `ORIGINAL USER GOAL: "${summary.goal}"

${summary.parsedGoal ? `PARSED INTENT:
- Task Type: ${summary.parsedGoal.taskType}
- Core Intent: ${summary.parsedGoal.intent}
- Key Entities: ${JSON.stringify(summary.parsedGoal.entities)}
- Constraints: ${summary.parsedGoal.constraints.join(', ') || 'None'}
- Required Payment: ${summary.parsedGoal.requiresPayment}
- Required Login: ${summary.parsedGoal.requiresLogin}
` : ''}

EXECUTION STATISTICS:
- Steps Planned: ${summary.totalSteps}
- Steps Completed: ${summary.stepsCompleted} (${completionRate}%)
- Steps Failed: ${summary.stepsFailed}
- Execution Duration: ${Math.round(summary.durationMs / 1000)}s
${summary.finalPageUrl ? `- Final Page URL: ${summary.finalPageUrl}` : ''}

STEP EXECUTION TRACE:
${summary.plan.steps.map(s => `  [${s.index}] ${s.action} → ${s.description} (skill: ${s.skillName || 'unknown'})`).join('\n')}

ERROR HISTORY:
${summary.errorHistory.length > 0 ? summary.errorHistory.map(e => `  ✗ ${e}`).join('\n') : '  None'}

${summary.extractedData ? `EXTRACTED DATA: ${JSON.stringify(summary.extractedData, null, 2)}` : ''}

Based on the above, did the execution satisfy the user's original goal?`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from VerifierAgent');

      const result = JSON.parse(content) as VerificationResult;

      this.logger.log(
        `Verification complete — Score: ${result.score}/100, verified: ${result.verified}, nextAction: ${result.nextAction}`
      );

      // Clamp values to safe ranges
      result.confidence = Math.max(0, Math.min(1, result.confidence));
      result.score = Math.max(0, Math.min(100, result.score));
      result.verified = result.score >= 70;

      // Merge deterministic step evidence (per-plugin counts) with LLM assessment
      const deterministic = this.buildDeterministicEvidence(summary);
      result.evidence = this.mergeEvidence(result.evidence, deterministic);

      return result;
    } catch (error: any) {
      this.logger.error(`VerifierAgent failed: ${error.message}`);
      return this.buildFallbackResult(summary, completionRate);
    }
  }

  /**
   * Quick verification from a screenshot — used mid-execution for step-level checks.
   */
  async verifyFromScreenshot(
    screenshotBase64: string,
    goal: string,
    lastStepDescription: string,
  ): Promise<{ confidence: number; explanation: string; shouldContinue: boolean }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You assess browser screenshots to determine if an AI agent is on track to achieve its goal.
Output JSON: { "confidence": 0.0-1.0, "explanation": "brief assessment", "shouldContinue": boolean }`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `GOAL: "${goal}"\nLAST ACTION: "${lastStepDescription}"\n\nIs the agent on track? Assess this screenshot:`,
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${screenshotBase64}`, detail: 'low' },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return { confidence: 0.5, explanation: 'Could not assess', shouldContinue: true };

      return JSON.parse(content);
    } catch {
      return { confidence: 0.5, explanation: 'Verification unavailable', shouldContinue: true };
    }
  }

  private buildFallbackResult(summary: ExecutionSummary, completionRate: number): VerificationResult {
    const score = completionRate;
    const verified = score >= 70;
    const deterministic = this.buildDeterministicEvidence(summary);
    return {
      verified,
      confidence: verified ? 0.6 : 0.3,
      score,
      summary: `Fallback assessment: ${completionRate}% of steps completed. Verifier LLM unavailable.`,
      evidence: deterministic,
      gaps: summary.errorHistory,
      achievements: [`Completed ${summary.stepsCompleted} of ${summary.totalSteps} planned steps`],
      nextAction: verified ? 'accept' : (score >= 50 ? 'retry' : 'replan'),
      reasoning: 'Fallback heuristic based on step completion rate. LLM verification was unavailable.',
    };
  }

  /**
   * Count completed actions per plugin/site from plan step metadata.
   * Produces evidence like { linkedin-apply: 4, indeed-apply: 5 }.
   */
  buildDeterministicEvidence(summary: ExecutionSummary): VerificationEvidence {
    const actionsCount: Record<string, number> = {};
    const sitesTested = new Set<string>();

    const pluginIds = summary.matchedPluginIds?.length
      ? summary.matchedPluginIds
      : summary.plan.skillsUsed || [];

    for (const pluginId of pluginIds) {
      sitesTested.add(pluginId);
    }

    for (const step of summary.plan.steps || []) {
      const skillName =
        (step as PlannedStep & { skillName?: string }).skillName ||
        this.extractSkillFromDescription(step.description);
      if (!skillName) continue;

      sitesTested.add(skillName);
      actionsCount[skillName] = (actionsCount[skillName] || 0) + 1;
    }

    return {
      sitesTested: [...sitesTested],
      actionsCount,
      artifactsCreated: [],
    };
  }

  private extractSkillFromDescription(description?: string): string | null {
    if (!description) return null;
    const match = description.match(/^\[([^\]]+)\]/);
    return match ? match[1] : null;
  }

  private mergeEvidence(
    llm: VerificationEvidence | undefined,
    deterministic: VerificationEvidence,
  ): VerificationEvidence {
    const actionsCount = { ...deterministic.actionsCount };
    if (llm?.actionsCount) {
      for (const [key, val] of Object.entries(llm.actionsCount)) {
        actionsCount[key] = Math.max(actionsCount[key] || 0, val);
      }
    }
    const sitesTested = [...new Set([
      ...deterministic.sitesTested,
      ...(llm?.sitesTested || []),
    ])];
    return {
      sitesTested,
      actionsCount,
      artifactsCreated: llm?.artifactsCreated || deterministic.artifactsCreated,
    };
  }
}
