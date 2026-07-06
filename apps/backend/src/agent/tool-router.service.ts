// backend/src/agent/tool-router.service.ts
//
// The ToolRouter is the arbitration layer between PlannerAgent and execution.
// Instead of ExecutionEngineService knowing about BrowserAgent directly,
// it asks the ToolRouter: "what handles this step and how?"
//
// This decouples the engine from agents. Adding APIAgent, FileAgent, 
// DatabaseAgent later = just registering a new handler here.

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PlannedStep } from '../shared/interfaces/agent.interfaces';
import { BrowserAgentService } from './browser-agent.service';

export type AgentType = 'browser' | 'api' | 'file' | 'memory' | 'unknown';

export interface ToolRoute {
  agentType: AgentType;
  agentName: string;
  skillName: string;
  args: Record<string, any>;
  confidence: number; // 0.0-1.0 how confident are we this route is correct
  reasoning: string;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  agentUsed: AgentType;
  agentName: string;
  durationMs: number;
  screenshot?: string | null;
}

// Skill → AgentType mapping. Static registry.
// When a new agent type is added (e.g. APIAgent), add its skills here.
const SKILL_TO_AGENT_MAP: Record<string, AgentType> = {
  SearchSkill: 'browser',
  FormFillSkill: 'browser',
  CompareSkill: 'browser',
  PurchaseSkill: 'browser',
  UploadSkill: 'browser',
  EmailSkill: 'browser',
  NavigationSkill: 'browser',
  DownloadSkill: 'browser',
  // Future agents (not yet implemented):
  // FetchAPISkill: 'api',
  // ReadFileSkill: 'file',
  // WriteFileSkill: 'file',
  // RecallMemorySkill: 'memory',
};

// Browser action → skill name mapping (for steps without explicit skillName)
const ACTION_TO_SKILL: Record<string, string> = {
  navigate: 'NavigationSkill',
  click: 'NavigationSkill',
  type: 'FormFillSkill',
  select: 'FormFillSkill',
  scroll: 'NavigationSkill',
  hover: 'NavigationSkill',
  extract_text: 'SearchSkill',
  extract_data: 'SearchSkill',
  upload_file: 'UploadSkill',
  screenshot: 'NavigationSkill',
  go_back: 'NavigationSkill',
  go_forward: 'NavigationSkill',
  refresh: 'NavigationSkill',
  evaluate: 'NavigationSkill',
  wait: 'NavigationSkill',
  press_key: 'NavigationSkill',
};

// Browser skill execution args builder
const BROWSER_SKILL_MAPPING: Record<string, string> = {
  navigate: 'open_site',
  click: 'click_element',
  type: 'fill_input',
  scroll: 'scroll_page',
  wait: 'wait_for_element',
  extract_text: 'extract_text',
  upload_file: 'upload_file',
};

@Injectable()
export class ToolRouterService {
  private readonly logger = new Logger(ToolRouterService.name);

  constructor(
    @Inject(forwardRef(() => BrowserAgentService))
    private browserAgent: BrowserAgentService,
  ) {}

  /**
   * Decide which agent should handle this step and how.
   * Returns the route decision with reasoning.
   */
  route(step: PlannedStep): ToolRoute {
    const skillName = step.skillName || ACTION_TO_SKILL[step.action] || 'NavigationSkill';
    const agentType = SKILL_TO_AGENT_MAP[skillName] || 'browser';

    const args = this.buildArgs(step);

    const route: ToolRoute = {
      agentType,
      agentName: this.getAgentName(agentType),
      skillName,
      args,
      confidence: this.calculateRouteConfidence(step, skillName),
      reasoning: `Step action "${step.action}" mapped to skill "${skillName}" → routed to ${agentType} agent`,
    };

    this.logger.debug(
      `ToolRouter: step[${step.index}] "${step.action}" → ${route.agentName} via ${route.skillName} (conf: ${route.confidence})`
    );

    return route;
  }

  /**
   * Execute a step using the routed agent. Returns normalized ToolResult.
   * This is the single execution point — ExecutionEngineService calls this
   * instead of calling BrowserAgentService directly.
   */
  async execute(sessionId: string, step: PlannedStep): Promise<ToolResult> {
    const started = Date.now();
    const route = this.route(step);

    try {
      switch (route.agentType) {
        case 'browser':
          return await this.executeBrowser(sessionId, step, route);

        case 'api':
          // Future: APIAgent
          this.logger.warn(`APIAgent not yet implemented. Step ${step.index} fallback to browser.`);
          return await this.executeBrowser(sessionId, step, route);

        case 'file':
          // Future: FileAgent
          this.logger.warn(`FileAgent not yet implemented. Step ${step.index} fallback to browser.`);
          return await this.executeBrowser(sessionId, step, route);

        default:
          return {
            success: false,
            error: `No agent registered for type: ${route.agentType}`,
            agentUsed: 'unknown',
            agentName: 'unknown',
            durationMs: Date.now() - started,
          };
      }
    } catch (error: any) {
      this.logger.error(`ToolRouter execution failed for step ${step.index}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        agentUsed: route.agentType,
        agentName: route.agentName,
        durationMs: Date.now() - started,
      };
    }
  }

  private async executeBrowser(
    sessionId: string,
    step: PlannedStep,
    route: ToolRoute,
  ): Promise<ToolResult> {
    const started = Date.now();
    
    // Use skill execution if the action maps to a known skill
    const skillAction = BROWSER_SKILL_MAPPING[step.action];
    const browserSkills = [
      'open_site', 'search_google', 'click_element', 'fill_input',
      'scroll_page', 'wait_for_element', 'extract_text', 'detect_login',
      'detect_payment', 'detect_otp', 'upload_file',
    ];

    let result: { success: boolean; screenshot?: string | null; error?: string; data?: any };

    if (skillAction && browserSkills.includes(skillAction)) {
      result = await this.browserAgent.executeSkill(sessionId, skillAction, route.args);
    } else {
      result = await this.browserAgent.executeAction(
        sessionId,
        step.action,
        step.target,
        step.value,
      );
    }

    return {
      success: result.success,
      data: result.data,
      error: result.error,
      screenshot: result.screenshot,
      agentUsed: 'browser',
      agentName: 'BrowserAgent',
      durationMs: Date.now() - started,
    };
  }

  private buildArgs(step: PlannedStep): Record<string, any> {
    const skillAction = BROWSER_SKILL_MAPPING[step.action];
    if (!skillAction) return { target: step.target, value: step.value };

    switch (skillAction) {
      case 'open_site': return { url: step.value };
      case 'search_google': return { query: step.value };
      case 'click_element': return { selector: step.target };
      case 'fill_input': return { selector: step.target, text: step.value };
      case 'scroll_page': return { pixels: parseInt(step.value || '500', 10) };
      case 'wait_for_element': return { selector: step.target || step.value, timeoutMs: 10000 };
      case 'extract_text': return { selector: step.target };
      case 'upload_file': return { selector: step.target, filePath: step.value };
      default: return { target: step.target, value: step.value };
    }
  }

  private calculateRouteConfidence(step: PlannedStep, skillName: string): number {
    // Higher confidence if step has explicit skillName from planner
    if (step.skillName && step.skillName === skillName) return 0.95;
    // Medium confidence if we inferred from action
    if (ACTION_TO_SKILL[step.action]) return 0.80;
    // Low confidence if we fell back to default
    return 0.60;
  }

  private getAgentName(agentType: AgentType): string {
    const names: Record<AgentType, string> = {
      browser: 'BrowserAgent',
      api: 'APIAgent',
      file: 'FileAgent',
      memory: 'MemoryAgent',
      unknown: 'UnknownAgent',
    };
    return names[agentType];
  }

  /**
   * Returns a human-readable summary of the routing decision for WS emission.
   */
  describeRoute(step: PlannedStep): string {
    const route = this.route(step);
    return `${route.agentName} → ${route.skillName} (confidence: ${Math.round(route.confidence * 100)}%)`;
  }
}
