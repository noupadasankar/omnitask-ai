import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';

/**
 * Global LLM service module.
 * Registered once in AppModule — all feature modules can inject LlmService
 * without explicit imports.
 */
@Global()
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
