import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { RetryService } from './retry.service';
import { CompensationService } from './compensation.service';
import { ShadowService } from './shadow.service';
import { BrowserModule } from '../browser/browser.module';

@Module({
  imports: [BrowserModule],
  providers: [ExecutionService, RetryService, CompensationService, ShadowService],
  exports: [ExecutionService],
})
export class ExecutionModule {}