import { Module, Global } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';

@Global()
@Module({
  providers: [PluginRegistryService],
  exports: [PluginRegistryService],
})
export class PluginsModule {}
