import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AiPlannerService {
  private readonly logger = new Logger(AiPlannerService.name);

  async createPlan(naturalLanguage: string) {
    this.logger.log(`AI planning for: ${naturalLanguage}`);

    // 🧠 TEMPORARY MOCK (we will replace with GPT next step)
    // BUT structured like real LLM output

    const plan = {
      goal: naturalLanguage,
      steps: [
        {
          id: 'step-1',
          type: 'analysis',
          action: 'understand_task',
          description: 'Understand user request',
          input: naturalLanguage,
        },
        {
          id: 'step-2',
          type: 'execution',
          action: 'perform_action',
          description: 'Execute main task using tools',
          input: {},
        },
        {
          id: 'step-3',
          type: 'analysis',
          action: 'verify_result',
          description: 'Validate output quality',
          input: {},
        },
      ],
    };

    return plan;
  }
}