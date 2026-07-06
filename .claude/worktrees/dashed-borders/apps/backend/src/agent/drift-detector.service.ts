import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export type DriftType = 'EXPLORATION' | 'DISTRACTION' | 'CONSTRAINT_INDUCED';

export interface TrajectoryState {
  sessionId: string;
  goalText: string;
  goalEmbedding: number[];
  trajectoryVector: number[];
  history: Array<{ stepIndex: number; actionName: string; stepDescription: string; vector: number[] }>;
}

@Injectable()
export class DriftDetectorService {
  private readonly logger = new Logger(DriftDetectorService.name);
  private openai: OpenAI;
  private trajectories = new Map<string, TrajectoryState>();

  // Alpha coefficient for trajectory accumulation (weight of history vs current step)
  private readonly DECAY_ALPHA = 0.6;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async initializeGoal(sessionId: string, goalText: string): Promise<void> {
    try {
      const goalEmbedding = await this.generateEmbedding(goalText);
      const state: TrajectoryState = {
        sessionId,
        goalText,
        goalEmbedding,
        trajectoryVector: [...goalEmbedding], // Start trajectory identical to the goal
        history: [],
      };
      this.trajectories.set(sessionId, state);
      this.logger.log(`Initialized drift trajectory state for session ${sessionId} with goal: "${goalText.substring(0, 50)}..."`);
    } catch (error: any) {
      this.logger.error(`Failed to initialize goal trajectory: ${error.message}`);
    }
  }

  async recordStep(
    sessionId: string,
    stepIndex: number,
    actionName: string,
    stepDescription: string,
    resultDetails: string,
  ): Promise<void> {
    const state = this.trajectories.get(sessionId);
    if (!state) return;

    try {
      const semanticSummary = `Action: ${actionName}. Objective: ${stepDescription}. Result: ${resultDetails.substring(0, 300)}`;
      const stepVector = await this.generateEmbedding(semanticSummary);

      // Accumulate trajectory vector: T_k = alpha * T_k-1 + (1 - alpha) * S_k
      state.trajectoryVector = state.trajectoryVector.map((val, idx) => {
        const nextVal = this.DECAY_ALPHA * val + (1 - this.DECAY_ALPHA) * (stepVector[idx] || 0);
        return nextVal;
      });

      // Normalize accumulated trajectory vector to prevent growth
      state.trajectoryVector = this.normalizeVector(state.trajectoryVector);

      state.history.push({
        stepIndex,
        actionName,
        stepDescription,
        vector: stepVector,
      });

      this.logger.debug(`Recorded trajectory vector step ${stepIndex} for session ${sessionId}`);
    } catch (error: any) {
      this.logger.error(`Failed to record step trajectory vector: ${error.message}`);
    }
  }

  async evaluateDrift(
    sessionId: string,
    phase: 'research' | 'selection' | 'transaction',
  ): Promise<{
    isDrifted: boolean;
    similarity: number;
    type: DriftType;
    explanation: string;
  }> {
    const state = this.trajectories.get(sessionId);
    if (!state) {
      return { isDrifted: false, similarity: 1.0, type: 'EXPLORATION', explanation: 'No trajectory state initialized.' };
    }

    // Dynamic thresholds based on active phase
    const thresholds = {
      research: 0.40,     // High exploration tolerance
      selection: 0.65,    // Medium constraints
      transaction: 0.85,  // Strict transactional consistency
    };
    const threshold = thresholds[phase] || 0.60;

    const similarity = this.cosineSimilarity(state.goalEmbedding, state.trajectoryVector);
    const isDrifted = similarity < threshold;

    let type: DriftType = 'EXPLORATION';
    let explanation = `Trajectory similarity is stable at ${(similarity * 100).toFixed(1)}% (Threshold: ${(threshold * 100).toFixed(0)}%)`;

    if (isDrifted) {
      // Run LLM classification of drift trajectory to decide if it's Exploration, Distraction, or Constraint-Induced
      type = await this.classifyDrift(state.goalText, state.history);
      
      if (type === 'EXPLORATION') {
        explanation = `Similarity dropped to ${(similarity * 100).toFixed(1)}%, but classified as productive exploration. Continuing execution.`;
      } else if (type === 'CONSTRAINT_INDUCED') {
        explanation = `Similarity dropped to ${(similarity * 100).toFixed(1)}% due to environmental dependency block. Rewriting graph constraints.`;
      } else {
        explanation = `Critical semantic distraction drift detected [ ${(similarity * 100).toFixed(1)}% ]. Agent has navigated away from objective. Pausing execution.`;
      }
    }

    return { isDrifted, similarity, type, explanation };
  }

  clearSession(sessionId: string): void {
    this.trajectories.delete(sessionId);
    this.logger.log(`Cleaned up trajectory drift memory context for session: ${sessionId}`);
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 1500),
    });
    return response.data[0]?.embedding || [];
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0.0;
    const dotProduct = vecA.reduce((sum, val, i) => sum + val * (vecB[i] || 0), 0);
    const magA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
    if (!magA || !magB) return 0.0;
    return dotProduct / (magA * magB);
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map(val => val / magnitude);
  }

  private async classifyDrift(goal: string, history: TrajectoryState['history']): Promise<DriftType> {
    const trace = history
      .map(h => `Step ${h.stepIndex} [${h.actionName}]: ${h.stepDescription}`)
      .join('\n');

    const prompt = `Deconstruct if this AI agent's execution history has drifted catastrophically from the user's original goal, or if it is doing necessary secondary exploration or handling an unavoidable constraint block.

USER ORIGINAL GOAL: "${goal}"

EXECUTION PATH HISTORY:
${trace}

Classify into one of these 3 types:
1. "EXPLORATION": The agent is looking for information, comparing articles, search terms, or links that are logically subordinate and serving the main goal.
2. "CONSTRAINT_INDUCED": The agent was blocked by an authorization screen, a cookie banner, a subscription prompt, or a payment setup, and was forced to divert to unblock itself.
3. "DISTRACTION": The agent has drifted onto irrelevant sites, clicked external advertisements, or wandered into loops that have nothing to do with solving the original task.

Output a JSON object ONLY: { "type": "EXPLORATION" | "DISTRACTION" | "CONSTRAINT_INDUCED", "reasoning": "brief description" }`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return 'DISTRACTION';

      const parsed = JSON.parse(content);
      return parsed.type || 'DISTRACTION';
    } catch {
      return 'DISTRACTION'; // Safe default
    }
  }
}
