import OpenAI from 'openai';

export const FEW_SHOT_EXAMPLES: OpenAI.Chat.ChatCompletionMessageParam[] = [
  {
    role: 'user',
    content: 'Task: Go to Hacker News and extract the top 5 post titles',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      goal: 'Extract top 5 post titles from Hacker News',
      estimatedSteps: 3,
      riskLevel: 'low',
      requiresLogin: false,
      steps: [
        { action: 'navigate', url: 'https://news.ycombinator.com', description: 'Navigate to Hacker News homepage', timeout: 15000 },
        { action: 'wait', selector: '.athing', description: 'Wait for posts to load', timeout: 5000 },
        { action: 'extract', selector: '.athing .titleline a:first-child', description: 'Extract top 5 post title text', timeout: 3000 },
      ],
    }),
  },
];