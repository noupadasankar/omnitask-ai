// backend/src/agent/screenshot-streamer.service.ts

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { BrowserAgentService } from './browser-agent.service';
import { AgentGateway } from '../websocket/agent.gateway';
import { ScreenshotFrame } from '../shared/interfaces/agent.interfaces';
import { SessionManagerService } from './runtime/session-manager.service';

@Injectable()
export class ScreenshotStreamerService {
  private readonly logger = new Logger(ScreenshotStreamerService.name);
  private streamingIntervals = new Map<string, NodeJS.Timeout>();
  private frameCounters = new Map<string, number>();

  constructor(
    @Inject(forwardRef(() => BrowserAgentService))
    private browserAgent: BrowserAgentService,
    @Inject(forwardRef(() => AgentGateway))
    private wsGateway: AgentGateway,
    // The first real frame is the inline runtime's proof the browser is live.
    @Inject(forwardRef(() => SessionManagerService))
    private sessionManager: SessionManagerService,
  ) {}

  startStreaming(sessionId: string, intervalMs = 500): void {
    this.stopStreaming(sessionId);

    this.frameCounters.set(sessionId, 0);
    this.logger.log(
      `Starting screenshot stream for ${sessionId} at ${intervalMs}ms`,
    );

    const interval = setInterval(async () => {
      try {
        const session = this.browserAgent.getSession(sessionId);
        if (!session || !session.isActive) {
          this.stopStreaming(sessionId);
          return;
        }

        const base64 = await this.browserAgent.takeScreenshot(sessionId);
        if (!base64) return;

        const cursorPos =
          await this.browserAgent.getCursorPosition(sessionId);

        const frameCount = (this.frameCounters.get(sessionId) || 0) + 1;
        this.frameCounters.set(sessionId, frameCount);

        const frame: ScreenshotFrame = {
          sessionId,
          stepIndex: -1,
          timestamp: Date.now(),
          base64,
          width: session.config.viewport.width,
          height: session.config.viewport.height,
          url: this.browserAgent.getCurrentUrl(sessionId) || undefined,
          cursorPosition: cursorPos || undefined,
        };

        this.wsGateway.emitToSession(sessionId, 'screenshot:frame', frame);

        // First real frame == the browser is demonstrably live and rendering.
        // This is where the inline runtime declares RUNNING (never the
        // orchestrator). Idempotent on every later frame.
        if (frameCount === 1) {
          this.sessionManager.transitionBrowserState(sessionId, 'RUNNING');
        }
      } catch (error: any) {
        const frameCount = this.frameCounters.get(sessionId) || 0;
        if (frameCount % 10 === 0) {
          this.logger.warn(
            `Stream frame error for ${sessionId}: ${error.message}`,
          );
        }
      }
    }, intervalMs);

    this.streamingIntervals.set(sessionId, interval);
  }

  stopStreaming(sessionId: string): void {
    const interval = this.streamingIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.streamingIntervals.delete(sessionId);
      this.frameCounters.delete(sessionId);
      this.logger.log(`Stopped screenshot stream for ${sessionId}`);
    }
  }

  async captureAndEmit(
    sessionId: string,
    stepIndex: number,
    highlightSelector?: string,
  ): Promise<string | null> {
    const base64 = await this.browserAgent.takeScreenshot(sessionId);
    if (!base64) return null;

    const session = this.browserAgent.getSession(sessionId);
    const cursorPos = await this.browserAgent.getCursorPosition(sessionId);

    const frame: ScreenshotFrame = {
      sessionId,
      stepIndex,
      timestamp: Date.now(),
      base64,
      width: session?.config.viewport.width || 1920,
      height: session?.config.viewport.height || 1080,
      url: this.browserAgent.getCurrentUrl(sessionId) || undefined,
      cursorPosition: cursorPos || undefined,
    };

    this.wsGateway.emitToSession(sessionId, 'screenshot:frame', frame);

    return base64;
  }

  isStreaming(sessionId: string): boolean {
    return this.streamingIntervals.has(sessionId);
  }
}
