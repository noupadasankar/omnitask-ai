import { Injectable } from '@nestjs/common';
import { PluginRegistryService } from '../../plugins/plugin-registry.service';
import { ExecutionGraphService } from '../../agent/runtime/execution-graph.service';
import { SkillRouterService } from '../../skills/skill-router.service';
import { BaseDomainAgent } from './base-domain.agent';

@Injectable()
export class MediaDomainAgent extends BaseDomainAgent {
  readonly id = 'media-agent';
  readonly name = 'Media Agent';
  readonly category = 'media' as const;
  readonly description = 'Search and play music, videos across YouTube, Spotify, and SoundCloud';
  readonly taskTypes = ['music_play', 'music_search', 'video_play', 'media_control'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }
}
