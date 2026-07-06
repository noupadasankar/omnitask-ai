import { BrowserProvider } from '../providers/browser-provider.interface';

export interface DomainAdapter {
  matches(url: string): boolean;
  executeGoal(
    provider: BrowserProvider,
    sessionId: string,
    goal: string,
  ): Promise<{ success: boolean; result?: any; error?: string }>;
}
