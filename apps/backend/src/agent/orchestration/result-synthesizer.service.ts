import { Injectable, Logger } from '@nestjs/common';
import { SubGoal, SynthesizedResult, ArtifactReference } from './interfaces';
import { LLM_MODEL_MINI } from '../../common/llm-config';
import { LlmService } from '../../common/llm/llm.service';

@Injectable()
export class ResultSynthesizerService {
  private readonly logger = new Logger(ResultSynthesizerService.name);

  constructor(private readonly llm: LlmService) {}

  async synthesize(
    originalGoal: string,
    completed: SubGoal[],
    failed: SubGoal[],
  ): Promise<SynthesizedResult> {
    this.logger.log(`[Synthesizer] Synthesizing ${completed.length} completed, ${failed.length} failed sub-goals`);

    if (completed.length === 0) {
      return {
        summary: 'All sub-tasks failed. Unable to complete the goal.',
        confidence: 0,
        data: {},
        artifacts: [],
        warnings: failed.map((f) => `${f.description}: ${f.error || 'Unknown error'}`),
        gaps: ['All planned tasks failed'],
      };
    }

    const llmResult = await this.synthesizeWithLLM(originalGoal, completed, failed);
    if (llmResult) return llmResult;

    return this.heuristicSynthesize(completed, failed);
  }

  private async synthesizeWithLLM(
    originalGoal: string,
    completed: SubGoal[],
    failed: SubGoal[],
  ): Promise<SynthesizedResult | null> {
    const completedResults = completed
      .map((sg) => {
        const resultStr = typeof sg.result === 'string'
          ? sg.result
          : JSON.stringify(sg.result, null, 2).slice(0, 2000);
        return `- [${sg.agentType}] ${sg.description}\n  Result: ${resultStr}`;
      })
      .join('\n');

    const failedDescriptions = failed
      .map((sg) => `- [${sg.agentType}] ${sg.description}: ${sg.error || 'Unknown error'}`)
      .join('\n');

    const systemPrompt = `You are a result synthesis engine for a multi-agent AI system.
Given the original goal, completed sub-task results, and failed sub-tasks, produce a unified synthesis.

Output STRICT JSON:
{
  "summary": "Clear, concise summary of what was accomplished (2-3 sentences)",
  "confidence": 0.0-1.0,
  "data": {
    "key findings": "merged key findings from all agents",
    "decisions made": "any decisions or actions taken"
  },
  "warnings": ["list of warnings or partial failures"],
  "gaps": ["what wasn't achieved or needs follow-up"]
}`;

    const userPrompt = `
Original Goal: "${originalGoal}"

Completed Sub-Tasks:
${completedResults}

${failed.length > 0 ? `Failed Sub-Tasks:\n${failedDescriptions}` : 'All sub-tasks completed successfully.'}

Synthesize the results. Return ONLY valid JSON.`;

    try {
      const response = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL_MINI,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content) as SynthesizedResult;

      return {
        summary: parsed.summary || 'Results synthesized.',
        confidence: parsed.confidence ?? (completed.length / Math.max(1, completed.length + failed.length)),
        data: parsed.data || {},
        artifacts: this.extractArtifacts(completed),
        warnings: [...(parsed.warnings || []), ...failed.map((f) => `${f.description}: ${f.error || 'failed'}`)],
        gaps: parsed.gaps || failed.map((f) => f.description),
      };
    } catch (error: any) {
      this.logger.error(`[Synthesizer] LLM synthesis failed: ${error.message}`);
      return null;
    }
  }

  private heuristicSynthesize(completed: SubGoal[], failed: SubGoal[]): SynthesizedResult {
    const successRate = completed.length / Math.max(1, completed.length + failed.length);
    const completedDescriptions = completed.map((sg) => sg.description).join('; ');

    const data: Record<string, unknown> = {};
    for (const sg of completed) {
      if (sg.result && typeof sg.result === 'object') {
        Object.assign(data, sg.result as Record<string, unknown>);
      }
    }

    const artifacts: ArtifactReference[] = completed
      .filter((sg) => sg.result && typeof sg.result === 'object' && (sg.result as any).artifact)
      .map((sg) => {
        const res = sg.result as any;
        return {
          id: `artifact-${sg.id}`,
          type: res.artifact?.type || 'data',
          description: res.artifact?.description || sg.description,
          agentSource: sg.agentType,
          url: res.artifact?.url,
        };
      });

    return {
      summary: successRate >= 0.8
        ? `Completed ${completed.length} tasks successfully. ${completedDescriptions}`
        : `Partially completed (${completed.length}/${completed.length + failed.length} tasks). ${completedDescriptions}`,
      confidence: successRate,
      data,
      artifacts,
      warnings: failed.map((f) => `${f.description}: ${f.error || 'failed'}`),
      gaps: failed.map((f) => f.description),
    };
  }

  private extractArtifacts(completed: SubGoal[]): ArtifactReference[] {
    const artifacts: ArtifactReference[] = [];

    for (const sg of completed) {
      if (!sg.result) continue;

      const res = sg.result as Record<string, unknown>;

      if (res.artifact) {
        const art = res.artifact as Record<string, unknown>;
        artifacts.push({
          id: `artifact-${sg.id}-${artifacts.length + 1}`,
          type: (art.type as string) || 'data',
          description: (art.description as string) || sg.description,
          agentSource: sg.agentType,
          url: art.url as string,
        });
      }

      if (Array.isArray(res.artifacts)) {
        for (const art of res.artifacts) {
          artifacts.push({
            id: `artifact-${sg.id}-${artifacts.length + 1}`,
            type: (art as any).type || 'data',
            description: (art as any).description || sg.description,
            agentSource: sg.agentType,
            url: (art as any).url,
          });
        }
      }
    }

    return artifacts;
  }
}
