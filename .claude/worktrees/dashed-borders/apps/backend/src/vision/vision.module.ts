import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ElementDetectorService } from './element-detector.service';
import { LayoutUnderstandingService } from './layout-understanding.service';
import { SemanticMatcherService } from './semantic-matcher.service';
import { DomAnalyzerService } from './dom-analyzer.service';
import { SemanticElementMatcherService } from './semantic-element-matcher.service';
import { SiteMemoryService } from './site-memory.service';
import { VisionOrchestratorService } from './vision-orchestrator.service';

@Module({
  imports: [PrismaModule],
  providers: [
    DomAnalyzerService,
    SemanticElementMatcherService,
    SiteMemoryService,
    VisionOrchestratorService,
    ElementDetectorService,
    LayoutUnderstandingService,
    SemanticMatcherService,
  ],
  exports: [
    DomAnalyzerService,
    SemanticElementMatcherService,
    SiteMemoryService,
    VisionOrchestratorService,
    ElementDetectorService,
    LayoutUnderstandingService,
    SemanticMatcherService,
  ],
})
export class VisionModule {}
