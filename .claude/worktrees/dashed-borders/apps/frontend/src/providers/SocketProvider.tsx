// frontend/src/providers/SocketProvider.tsx

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { wsService } from '@/services/websocket.service';
import { ScreenshotFrame, ExecutionEventType } from '@/types/agent';

export interface ExecutionEvent {
  type: ExecutionEventType;
  data: Record<string, any>;
  timestamp: number;
}

export interface SocketContextType {
  isConnected: boolean;
  latestFrame: ScreenshotFrame | null;
  executionEvents: ExecutionEvent[];
  pendingApproval: {
    id: string;
    stepIndex: number;
    riskLevel: string;
    actionDetails: Record<string, any>;
    expiresAt: string;
  } | null;
  logs: Array<{ level: string; message: string; timestamp: number }>;
  sendApprovalResponse: (approvalId: string, status: 'APPROVED' | 'DENIED') => void;
  pauseSession: (sessionId: string) => void;
  resumeSession: (sessionId: string) => void;
  cancelSession: (sessionId: string) => void;
  joinSession: (sessionId: string, userId: string) => void;
  leaveSession: (sessionId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export interface SocketProviderProps {
  children: ReactNode;
  url?: string;
}

export function SocketProvider({
  children,
  url = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, '') || 'http://localhost:4000',
}: SocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [latestFrame, setLatestFrame] = useState<ScreenshotFrame | null>(null);
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<SocketContextType['pendingApproval']>(null);
  const [logs, setLogs] = useState<Array<{ level: string; message: string; timestamp: number }>>([]);

  const sendApprovalResponse = useCallback((approvalId: string, status: 'APPROVED' | 'DENIED') => {
    wsService.sendApprovalResponse(approvalId, status);
  }, []);

  const pauseSession = useCallback((sessionId: string) => {
    wsService.pauseSession(sessionId);
  }, []);

  const resumeSession = useCallback((sessionId: string) => {
    wsService.resumeSession(sessionId);
  }, []);

  const cancelSession = useCallback((sessionId: string) => {
    wsService.cancelSession(sessionId);
  }, []);

  const joinSession = useCallback((sessionId: string, userId: string) => {
    wsService.joinSession(sessionId, userId);
  }, []);

  const leaveSession = useCallback((sessionId: string) => {
    wsService.leaveSession(sessionId);
  }, []);

  useEffect(() => {
    const initializeSocket = async () => {
      try {
        if (!url) return;
        await wsService.connect(url);
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
        setIsConnected(false);
      }
    };

    initializeSocket();

    return () => {
      wsService.disconnect();
    };
  }, [url]);

  useEffect(() => {
    // Listen for connection status changes
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    wsService.on('connect', handleConnect);
    wsService.on('disconnect', handleDisconnect);

    return () => {
      wsService.on('connect', handleConnect);
      wsService.on('disconnect', handleDisconnect);
    };
  }, []);

  useEffect(() => {
    // Listen for screenshot frames
    const unsubscribeFrame = wsService.on('screenshot:frame', (frame: ScreenshotFrame) => {
      setLatestFrame(frame);
    });

    return unsubscribeFrame;
  }, []);

  useEffect(() => {
    // Listen for execution events
    const unsubscribeEvent = wsService.on('execution:event', (event: { type: ExecutionEventType; data: any }) => {
      const newEvent: ExecutionEvent = {
        type: event.type,
        data: event.data,
        timestamp: Date.now(),
      };
      setExecutionEvents((prev) => [...prev, newEvent].slice(-200));

      // Add to logs
      const logMessage = `${event.type}: ${JSON.stringify(event.data).substring(0, 50)}...`;
      setLogs((prev) =>
        [
          ...prev,
          {
            level: event.type.includes('error') || event.type.includes('failed') ? 'error' : 'info',
            message: logMessage,
            timestamp: Date.now(),
          },
        ].slice(-500),
      );
    });

    return unsubscribeEvent;
  }, []);

  useEffect(() => {
    // Proxy all execution:* events to execution:event
    const eventTypes: ExecutionEventType[] = [
      'session:started',
      'plan:created',
      'plan:replanned',
      'step:started',
      'step:completed',
      'step:failed',
      'step:blocked',
      'step:denied',
      'step:validation_failed',
      'approval:requested',
      'approval:responded',
      'approval:expired',
      'browser:initialized',
      'execution:paused',
      'execution:resumed',
      'execution:cancelled',
      'execution:completed',
      'execution:failed',
      'log:debug',
      'log:info',
      'log:warn',
      'log:error',
    ];

    const unsubscribers: Array<() => void> = [];

    for (const eventType of eventTypes) {
      const unsubscribe = wsService.on(eventType, (data: any) => {
        const newEvent: ExecutionEvent = {
          type: eventType,
          data,
          timestamp: Date.now(),
        };
        setExecutionEvents((prev) => [...prev, newEvent].slice(-200));
      });
      unsubscribers.push(unsubscribe);
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  useEffect(() => {
    // Listen for approval requests
    const unsubscribeApproval = wsService.on('approval:requested', (data: any) => {
      setPendingApproval({
        id: data.approvalRequestId,
        stepIndex: data.stepIndex,
        riskLevel: data.riskLevel,
        actionDetails: data.actionDetails,
        expiresAt: data.expiresAt,
      });
    });

    const unsubscribeResponded = wsService.on('approval:responded', (data: any) => {
      setPendingApproval(null);
    });

    const unsubscribeExpired = wsService.on('approval:expired', (data: any) => {
      setPendingApproval(null);
    });

    return () => {
      unsubscribeApproval();
      unsubscribeResponded();
      unsubscribeExpired();
    };
  }, []);

  const value: SocketContextType = {
    isConnected,
    latestFrame,
    executionEvents,
    pendingApproval,
    logs,
    sendApprovalResponse,
    pauseSession,
    resumeSession,
    cancelSession,
    joinSession,
    leaveSession,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextType {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
