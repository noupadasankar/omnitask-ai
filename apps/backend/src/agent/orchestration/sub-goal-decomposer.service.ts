import { Injectable, Logger } from '@nestjs/common';
import { LLM_MODEL } from '../../common/llm-config';
import { LlmService } from '../../common/llm/llm.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { SubGoal, SubGoalDecomposition } from './interfaces';

@Injectable()
export class SubGoalDecomposerService {
  private readonly logger = new Logger(SubGoalDecomposerService.name);

  constructor(
    private readonly llm: LlmService,
    private prisma: PrismaService,
    private agentRegistry: AgentRegistryService,
  ) {}

  async decompose(goal: string, userId: string, sessionId: string): Promise<SubGoalDecomposition> {
    this.logger.log(`[SubGoalDecomposer] Decomposing: "${goal.slice(0, 100)}..."`);

    const memories = await this.prisma.agentMemory.findMany({
      where: { userId, type: 'SEMANTIC' },
      orderBy: { importance: 'desc' },
      take: 10,
    });

    const userPreferences = await this.prisma.agentMemory.findMany({
      where: { userId, type: 'PROCEDURAL' },
      orderBy: { lastAccessedAt: 'desc' },
      take: 5,
    });

    const agents = this.agentRegistry.listAgents();
    const agentCatalog = agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      taskTypes: a.taskTypes,
    }));

    const llmResult = await this.decomposeWithLLM(goal, agentCatalog, memories, userPreferences);
    if (llmResult) return llmResult;

    return this.heuristicDecompose(goal);
  }

  private async decomposeWithLLM(
    goal: string,
    agents: { id: string; name: string; description: string; taskTypes: string[] }[],
    memories: { content: string; importance: number }[],
    preferences: { content: string }[],
  ): Promise<SubGoalDecomposition | null> {
    const systemPrompt = `You are a master task decomposition engine for a multi-agent AI system.
Break down the user's goal into sub-tasks that can be executed by specialized agents.

Available agents:
${JSON.stringify(agents, null, 2)}

For each sub-goal, specify:
- Which agent type should handle it
- What dependencies exist between sub-goals
- Priority (1 = highest)
- Whether sub-goals can run in parallel

Output STRICT JSON matching this schema:
{
  "subGoals": [
    {
      "id": "subgoal-1",
      "description": "clear description of what needs to be done",
      "agentType": "which agent handles this (must match an agent id from the catalog)",
      "priority": 1,
      "dependencies": ["ids of sub-goals that must complete first"],
      "context": { "key": "relevant context for this sub-goal" },
      "maxRetries": 2
    }
  ],
  "reasoning": "explain the decomposition strategy",
  "parallelGroups": [["subgoal-1", "subgoal-2"], ["subgoal-3"]],
  "estimatedTotalComplexity": "simple | moderate | complex | very_complex"
}`;

    const userContext = `
Goal: "${goal}"

User memory signals:
${memories.map((m) => `- [importance:${m.importance}] ${m.content}`).join('\n')}

User learned preferences:
${preferences.map((p) => `- ${p.content}`).join('\n')}

Decompose this goal into sub-tasks for the multi-agent system. Return ONLY valid JSON.`;

    try {
      const response = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContext },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content) as SubGoalDecomposition;

      const validated: SubGoal[] = (parsed.subGoals || []).map((sg, i) => ({
        id: sg.id || `subgoal-${i + 1}`,
        description: sg.description,
        agentType: sg.agentType || 'research-agent',
        priority: sg.priority ?? (i + 1),
        dependencies: sg.dependencies || [],
        context: sg.context || {},
        status: 'pending' as const,
        retryCount: 0,
        maxRetries: sg.maxRetries ?? 2,
      }));

      return {
        subGoals: validated,
        reasoning: parsed.reasoning || 'LLM decomposition completed',
        parallelGroups: parsed.parallelGroups || this.inferParallelGroups(validated),
        estimatedTotalComplexity: parsed.estimatedTotalComplexity || 'moderate',
      };
    } catch (error: any) {
      this.logger.error(`[SubGoalDecomposer] LLM decomposition failed: ${error.message}`);
      return null;
    }
  }

  private heuristicDecompose(goal: string): SubGoalDecomposition {
    const g = goal.toLowerCase();

    if (g.includes('plan') && (g.includes('trip') || g.includes('vacation') || g.includes('travel'))) {
      return {
        subGoals: [
          { id: 'subgoal-1', description: 'Research destinations and attractions', agentType: 'research-agent', priority: 1, dependencies: [], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-2', description: 'Search and book flights', agentType: 'travel-agent', priority: 2, dependencies: ['subgoal-1'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-3', description: 'Search and book hotels', agentType: 'booking-agent', priority: 2, dependencies: ['subgoal-1'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-4', description: 'Find restaurants and make reservations', agentType: 'booking-agent', priority: 3, dependencies: ['subgoal-1'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-5', description: 'Generate itinerary document', agentType: 'file-agent', priority: 4, dependencies: ['subgoal-2', 'subgoal-3', 'subgoal-4'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
        ],
        reasoning: 'Travel planning decomposed into research, flights, hotels, dining, and document generation',
        parallelGroups: [['subgoal-2', 'subgoal-3', 'subgoal-4'], ['subgoal-5']],
        estimatedTotalComplexity: 'complex',
      };
    }

    if (g.includes('event') || g.includes('party') || g.includes('conference') || g.includes('meetup')) {
      return {
        subGoals: [
          { id: 'subgoal-1', description: 'Research venue options', agentType: 'research-agent', priority: 1, dependencies: [], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-2', description: 'Send invitations via email', agentType: 'email-agent', priority: 2, dependencies: ['subgoal-1'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-3', description: 'Post event on social media', agentType: 'social-agent', priority: 2, dependencies: ['subgoal-1'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-4', description: 'Track budget and expenses', agentType: 'finance-agent', priority: 3, dependencies: ['subgoal-1'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-5', description: 'Create event document with schedule', agentType: 'file-agent', priority: 3, dependencies: ['subgoal-2'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
        ],
        reasoning: 'Event planning decomposed into venue research, communications, social promotion, budget tracking, and documentation',
        parallelGroups: [['subgoal-2', 'subgoal-3', 'subgoal-4']],
        estimatedTotalComplexity: 'complex',
      };
    }

    if (g.includes('research') || g.includes('find') || g.includes('search') || g.includes('learn')) {
      return {
        subGoals: [
          { id: 'subgoal-1', description: `Search the web for information about: ${goal}`, agentType: 'research-agent', priority: 1, dependencies: [], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-2', description: 'Synthesize findings into a structured report', agentType: 'file-agent', priority: 2, dependencies: ['subgoal-1'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
        ],
        reasoning: 'Research task decomposed into web search and report generation',
        parallelGroups: [['subgoal-1']],
        estimatedTotalComplexity: 'moderate',
      };
    }

    if (g.includes('email') || g.includes('mail') || g.includes('newsletter') || g.includes('campaign')) {
      return {
        subGoals: [
          { id: 'subgoal-1', description: 'Research and gather content for communication', agentType: 'research-agent', priority: 1, dependencies: [], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-2', description: 'Create email content and design', agentType: 'file-agent', priority: 2, dependencies: ['subgoal-1'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-3', description: 'Send emails to recipients', agentType: 'email-agent', priority: 3, dependencies: ['subgoal-2'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
          { id: 'subgoal-4', description: 'Post related content on social media', agentType: 'social-agent', priority: 3, dependencies: ['subgoal-2'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
        ],
        reasoning: 'Communication campaign decomposed into content research, creation, email delivery, and social promotion',
        parallelGroups: [['subgoal-3', 'subgoal-4']],
        estimatedTotalComplexity: 'moderate',
      };
    }

    return {
      subGoals: [
        { id: 'subgoal-1', description: `Research and gather information: ${goal.slice(0, 200)}`, agentType: 'research-agent', priority: 1, dependencies: [], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
        { id: 'subgoal-2', description: 'Execute the main action based on research', agentType: 'research-agent', priority: 2, dependencies: ['subgoal-1'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
        { id: 'subgoal-3', description: 'Compile and present results', agentType: 'file-agent', priority: 3, dependencies: ['subgoal-2'], context: {}, status: 'pending', retryCount: 0, maxRetries: 2 },
      ],
      reasoning: 'General task decomposed into research, execution, and reporting phases',
      parallelGroups: [['subgoal-1']],
      estimatedTotalComplexity: 'moderate',
    };
  }

  private inferParallelGroups(subGoals: SubGoal[]): string[][] {
    const groups: string[][] = [];
    const handled = new Set<string>();

    const sorted = [...subGoals].sort((a, b) => a.priority - b.priority);

    for (const sg of sorted) {
      if (handled.has(sg.id)) continue;

      const parallel = sorted.filter(
        (other) =>
          !handled.has(other.id) &&
          other.id !== sg.id &&
          other.priority === sg.priority &&
          !other.dependencies.some((d) => sg.dependencies.includes(d) || d === sg.id),
      );

      const group = [sg.id, ...parallel.map((p) => p.id)];
      group.forEach((id) => handled.add(id));
      groups.push(group);
    }

    return groups;
  }
}
