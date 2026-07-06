import { Injectable } from '@nestjs/common';
import { ParsedGoal } from '../../agent/goal-understanding.service';
import { PluginRegistryService } from '../../plugins/plugin-registry.service';
import { ExecutionGraphService } from '../../agent/runtime/execution-graph.service';
import { SkillRouterService } from '../../skills/skill-router.service';
import {
  DomainAgentBuildContext,
  DomainAgentGraphResult,
} from '../domain-agent.interface';
import { AgentPlan } from '../../shared/interfaces/agent.interfaces';
import { BaseDomainAgent } from './base-domain.agent';

@Injectable()
export class BookingDomainAgent extends BaseDomainAgent {
  readonly id = 'booking-agent';
  readonly name = 'Booking Agent';
  readonly category = 'general' as const;
  readonly description = 'Handles reservations, appointments, and bookings across travel, dining, and services';
  readonly taskTypes = ['ticket_booking', 'hotel_booking', 'restaurant_booking', 'appointment', 'reservation'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }

  async buildGraph(goal: ParsedGoal, context: DomainAgentBuildContext): Promise<DomainAgentGraphResult> {
    const plan = this.generateBookingPlan(goal, context);
    const graph = this.graphService.graphFromLinearPlan(context.goalText, this.category, plan);
    return { graph, plan, pluginIds: [], parallel: false };
  }

  private generateBookingPlan(goal: ParsedGoal, context: DomainAgentBuildContext): AgentPlan {
    const type = this.detectBookingType(context.goalText);

    const steps = [
      {
        index: 0, action: 'navigate' as const, value: context.goalText,
        description: `Search for ${type} options matching: ${context.goalText}`,
        riskLevel: 'LOW' as const, requiresApproval: false,
        expectedOutcome: 'Available options found',
      },
      {
        index: 1, action: 'extract_data' as const,
        description: 'Compare options by price, location, rating, and availability',
        riskLevel: 'LOW' as const, requiresApproval: false,
        expectedOutcome: 'Best options identified',
      },
      {
        index: 2, action: 'click' as const,
        description: `Confirm and submit ${type} booking`,
        riskLevel: 'HIGH' as const, requiresApproval: true,
        expectedOutcome: 'Booking confirmed',
      },
    ];

    return {
      taskId: `booking-${Date.now()}`,
      goal: context.goalText,
      steps: steps,
      estimatedDuration: 120,
      riskAssessment: {
        overallRisk: 'MEDIUM' as const,
        reasons: [`${type} booking requires confirmation`],
        requiresUserApproval: true,
      },
    };
  }

  private detectBookingType(goal: string): string {
    const g = goal.toLowerCase();
    if (/\b(flight|plane|airline|airport|fly)\b/.test(g)) return 'flight';
    if (/\b(hotel|stay|room|lodging|accommodation|resort)\b/.test(g)) return 'hotel';
    if (/\b(restaurant|table|dinner|lunch|breakfast|cafe|dining)\b/.test(g)) return 'restaurant';
    if (/\b(appointment|doctor|dentist|consultation|meeting|salon)\b/.test(g)) return 'appointment';
    if (/\b(ticket|concert|show|movie|event|theatre)\b/.test(g)) return 'event';
    return 'other';
  }
}
