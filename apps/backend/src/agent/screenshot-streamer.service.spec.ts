import { Test, TestingModule } from '@nestjs/testing';
import { ScreenshotStreamerService } from './screenshot-streamer.service';
import { BrowserAgentService } from './browser-agent.service';
import { AgentGateway } from '../websocket/agent.gateway';
import { SessionManagerService } from './runtime/session-manager.service';

describe('ScreenshotStreamerService', () => {
  let service: ScreenshotStreamerService;
  let browserAgent: any;
  let wsGateway: any;
  let sessionManager: any;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    browserAgent = {
      getSession: jest.fn(),
      takeScreenshot: jest.fn(),
      getCursorPosition: jest.fn(),
      getCurrentUrl: jest.fn().mockReturnValue(undefined),
    };
    wsGateway = {
      emitToSession: jest.fn(),
    };
    sessionManager = {
      transitionBrowserState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScreenshotStreamerService,
        { provide: BrowserAgentService, useValue: browserAgent },
        { provide: AgentGateway, useValue: wsGateway },
        { provide: SessionManagerService, useValue: sessionManager },
      ],
    }).compile();
    service = module.get<ScreenshotStreamerService>(ScreenshotStreamerService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startStreaming', () => {
    it('should start interval and emit first frame', async () => {
      browserAgent.getSession.mockReturnValue({ isActive: true, config: { viewport: { width: 1920, height: 1080 } } });
      browserAgent.takeScreenshot.mockResolvedValue('base64data');
      browserAgent.getCursorPosition.mockResolvedValue({ x: 100, y: 200 });
      browserAgent.getCurrentUrl.mockReturnValue('https://example.com');

      service.startStreaming('session-1', 500);

      expect(service.isStreaming('session-1')).toBe(true);

      await jest.advanceTimersByTimeAsync(500);

      expect(browserAgent.takeScreenshot).toHaveBeenCalledWith('session-1');
      expect(wsGateway.emitToSession).toHaveBeenCalledWith(
        'session-1',
        'screenshot:frame',
        expect.objectContaining({
          sessionId: 'session-1',
          base64: 'base64data',
          width: 1920,
          height: 1080,
          url: 'https://example.com',
          cursorPosition: { x: 100, y: 200 },
        }),
      );
    });

    it('should transition to RUNNING on first frame', async () => {
      browserAgent.getSession.mockReturnValue({ isActive: true, config: { viewport: { width: 1024, height: 768 } } });
      browserAgent.takeScreenshot.mockResolvedValue('img');
      browserAgent.getCursorPosition.mockResolvedValue(null);
      browserAgent.getCurrentUrl.mockReturnValue(undefined);

      service.startStreaming('session-1', 500);

      await jest.advanceTimersByTimeAsync(500);

      expect(sessionManager.transitionBrowserState).toHaveBeenCalledWith('session-1', 'RUNNING');
      expect(service.isStreaming('session-1')).toBe(true);
    });

    it('should stop streaming when session becomes inactive', async () => {
      browserAgent.getSession
        .mockReturnValueOnce({ isActive: true, config: { viewport: { width: 1024, height: 768 } } }) // first tick
        .mockReturnValueOnce(null); // second tick

      browserAgent.takeScreenshot.mockResolvedValue('img');
      browserAgent.getCursorPosition.mockResolvedValue(null);
      browserAgent.getCurrentUrl.mockReturnValue(undefined);

      service.startStreaming('session-1', 500);

      await jest.advanceTimersByTimeAsync(500); // first tick: getSession returns session, emits frame
      await jest.advanceTimersByTimeAsync(500); // second tick: getSession returns null, stops streaming

      expect(service.isStreaming('session-1')).toBe(false);
    });

    it('should skip frame when screenshot returns null', async () => {
      browserAgent.getSession.mockReturnValue({ isActive: true, config: { viewport: { width: 1024, height: 768 } } });
      browserAgent.takeScreenshot.mockResolvedValue(null);

      service.startStreaming('session-1', 500);

      await jest.advanceTimersByTimeAsync(500);

      expect(wsGateway.emitToSession).not.toHaveBeenCalled();
    });

    it('should handle frame errors without crashing', async () => {
      browserAgent.getSession.mockReturnValue({ isActive: true, config: { viewport: { width: 1024, height: 768 } } });
      browserAgent.takeScreenshot.mockRejectedValue(new Error('Browser error'));

      service.startStreaming('session-1', 500);

      await jest.advanceTimersByTimeAsync(500);

      expect(wsGateway.emitToSession).not.toHaveBeenCalled();
    });

    it('should replace existing stream for same session', async () => {
      browserAgent.getSession.mockReturnValue({ isActive: false });
      browserAgent.takeScreenshot.mockResolvedValue('img');

      service.startStreaming('session-1', 100);
      service.startStreaming('session-1', 100);

      const intervals = (service as any).streamingIntervals;
      expect(intervals.size).toBe(1);
    });
  });

  describe('stopStreaming', () => {
    it('should stop an active stream', async () => {
      browserAgent.getSession.mockReturnValue({ isActive: true, config: { viewport: { width: 1024, height: 768 } } });
      browserAgent.takeScreenshot.mockResolvedValue('img');
      browserAgent.getCursorPosition.mockResolvedValue(null);
      browserAgent.getCurrentUrl.mockReturnValue(undefined);

      service.startStreaming('session-1', 500);
      expect(service.isStreaming('session-1')).toBe(true);

      service.stopStreaming('session-1');
      expect(service.isStreaming('session-1')).toBe(false);
    });

    it('should be no-op for non-existent session', () => {
      expect(() => service.stopStreaming('ghost')).not.toThrow();
    });
  });

  describe('captureAndEmit', () => {
    it('should capture frame and emit to session', async () => {
      browserAgent.takeScreenshot.mockResolvedValue('base64img');
      browserAgent.getSession.mockReturnValue({ config: { viewport: { width: 1920, height: 1080 } } });
      browserAgent.getCursorPosition.mockResolvedValue({ x: 50, y: 60 });
      browserAgent.getCurrentUrl.mockReturnValue('https://example.com/page');

      const result = await service.captureAndEmit('session-1', 3);

      expect(result).toBe('base64img');
      expect(wsGateway.emitToSession).toHaveBeenCalledWith(
        'session-1',
        'screenshot:frame',
        expect.objectContaining({ stepIndex: 3 }),
      );
    });

    it('should return null when screenshot fails', async () => {
      browserAgent.takeScreenshot.mockResolvedValue(null);

      const result = await service.captureAndEmit('session-1', 0);
      expect(result).toBeNull();
    });

    it('should use defaults when session is null', async () => {
      browserAgent.takeScreenshot.mockResolvedValue('img');
      browserAgent.getSession.mockReturnValue(null);
      browserAgent.getCursorPosition.mockResolvedValue(null);
      browserAgent.getCurrentUrl.mockReturnValue(undefined);

      const result = await service.captureAndEmit('session-1', 1);
      expect(result).toBe('img');
      expect(wsGateway.emitToSession).toHaveBeenCalledWith(
        'session-1',
        'screenshot:frame',
        expect.objectContaining({ width: 1920, height: 1080 }),
      );
    });
  });

  describe('isStreaming', () => {
    it('should return false for inactive session', () => {
      expect(service.isStreaming('ghost')).toBe(false);
    });
  });
});
