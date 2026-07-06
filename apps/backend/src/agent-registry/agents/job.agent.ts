import { Injectable } from '@nestjs/common';
import { PluginRegistryService } from '../../plugins/plugin-registry.service';
import { ExecutionGraphService } from '../../agent/runtime/execution-graph.service';
import { SkillRouterService } from '../../skills/skill-router.service';
import { BaseDomainAgent } from './base-domain.agent';

@Injectable()
export class JobDomainAgent extends BaseDomainAgent {
  readonly id = 'job-agent';
  readonly name = 'Job Agent';
  readonly category = 'job' as const;
  readonly description = 'Search and apply to jobs across LinkedIn, Indeed, Naukri, and Wellfound';
  readonly taskTypes = ['job_search'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }
}
