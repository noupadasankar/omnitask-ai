import { Injectable, Logger } from '@nestjs/common';
import { BrowserProvider, ExtractedElement } from './browser-provider.interface';

export interface SimulationStep {
  action: string;
  target: string;
  value?: string;
  result: string;
  simulatedResponse: any;
  timestamp: number;
}

export interface SimulationTrace {
  sessionId: string;
  steps: SimulationStep[];
  screenshotCount: number;
  totalActions: number;
  startTime: number;
  endTime: number;
}

@Injectable()
export class MockBrowserProvider implements BrowserProvider {
  private readonly logger = new Logger(MockBrowserProvider.name);
  private traces = new Map<string, SimulationTrace>();
  private sessions = new Set<string>();

  async launch(
    sessionId: string,
    _userId: string,
    _config: { headless?: boolean; width?: number; height?: number },
  ): Promise<void> {
    this.sessions.add(sessionId);
    this.traces.set(sessionId, {
      sessionId,
      steps: [],
      screenshotCount: 0,
      totalActions: 0,
      startTime: Date.now(),
      endTime: 0,
    });
    this.logger.log(`[SIMULATION] Browser launched (mock): session=${sessionId}`);
  }

  async navigate(sessionId: string, url: string): Promise<string> {
    this.record(sessionId, 'navigate', url, undefined, `Navigated to ${url} (simulated)`);
    return `<html><body><h1>Simulated: ${url}</h1><p>Mock page content for simulation mode.</p></body></html>`;
  }

  async click(sessionId: string, target: string): Promise<void> {
    this.record(sessionId, 'click', target, undefined, `Clicked ${target} (simulated OK)`);
  }

  async type(sessionId: string, target: string, value: string): Promise<void> {
    this.record(sessionId, 'type', target, value, `Typed "${value}" into ${target} (simulated OK)`);
  }

  async screenshot(_sessionId: string): Promise<string> {
    return 'data:image/png;base64,SIMULATED_SCREENSHOT';
  }

  async getInteractiveElements(_sessionId: string): Promise<ExtractedElement[]> {
    return [
      { id: 'mock-1', role: 'link', text: 'Simulated Link', ariaLabel: 'Simulated link', bounds: { x: 0, y: 0, width: 100, height: 20 }, selector: '#mock-1' },
      { id: 'mock-2', role: 'button', text: 'Simulated Button', ariaLabel: 'Simulated button', bounds: { x: 0, y: 30, width: 120, height: 40 }, selector: '#mock-2' },
      { id: 'mock-3', role: 'textbox', text: '', ariaLabel: 'Simulated input', bounds: { x: 0, y: 80, width: 300, height: 30 }, selector: '#mock-3' },
    ];
  }

  async close(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    const trace = this.traces.get(sessionId);
    if (trace) {
      trace.endTime = Date.now();
      this.logger.log(`[SIMULATION] Browser closed: session=${sessionId}, actions=${trace.totalActions}`);
    }
  }

  async getCookies(_sessionId: string): Promise<any[]> {
    return [{ name: 'sim_session', value: 'mock', domain: '.simulated.local', path: '/' }];
  }

  async setCookies(_sessionId: string, _cookies: any[]): Promise<void> {
    // no-op
  }

  getTrace(sessionId: string): SimulationTrace | undefined {
    return this.traces.get(sessionId);
  }

  private record(sessionId: string, action: string, target: string, value?: string, result?: string): void {
    const trace = this.traces.get(sessionId);
    if (!trace) return;
    trace.steps.push({ action, target, value, result: result || 'OK', simulatedResponse: null, timestamp: Date.now() });
    trace.totalActions++;
  }
}
