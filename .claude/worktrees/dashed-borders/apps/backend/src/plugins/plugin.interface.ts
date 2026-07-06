// Site-level plugin contract.
// Each plugin encapsulates one website/service (LinkedIn, Swiggy, Amazon, etc.)
// Future: npm install omnitask-linkedin-plugin → registerPlugin()

import { ParsedGoal } from '../agent/goal-understanding.service';
import { AgentPlan } from '../shared/interfaces/agent.interfaces';

export interface PluginSearchResult {
  items: Array<Record<string, unknown>>;
  source: string;
}

export interface PluginExtractResult {
  data: Record<string, unknown>;
  source: string;
}

export interface PluginExecuteResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  screenshot?: string;
  durationMs?: number;
}

export interface PluginVerifyResult {
  verified: boolean;
  confidence: number;
  evidence: string[];
  message?: string;
}

export interface SitePlugin {
  /** Unique plugin id, e.g. 'linkedin' */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Domain category: job | food | shopping | travel | research | social */
  readonly category: string;

  /** Domains this plugin operates on */
  readonly supportedDomains: string[];

  /** Plugin semver for marketplace */
  readonly version: string;

  initialize?(): Promise<void>;

  canHandle(goal: ParsedGoal): boolean;

  /** Build browser execution plan for this site */
  buildPlan(goal: ParsedGoal): AgentPlan;

  search?(goal: ParsedGoal): Promise<PluginSearchResult>;

  extract?(context: Record<string, unknown>): Promise<PluginExtractResult>;

  execute?(plan: AgentPlan): Promise<PluginExecuteResult>;

  verify?(result: PluginExecuteResult): Promise<PluginVerifyResult>;
}

export interface PluginMetadata {
  id: string;
  name: string;
  category: string;
  supportedDomains: string[];
  version: string;
}
