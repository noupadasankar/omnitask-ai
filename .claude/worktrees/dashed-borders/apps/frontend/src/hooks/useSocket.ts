'use client';

import { io, Socket } from 'socket.io-client';
import { useEffect, useRef, useState, useCallback } from 'react';

/* ===========================================================
   TYPES
=========================================================== */

export interface AgentEvent {
  event: string;
  data: unknown;
  at: string;
  agent?: string;
  level?: 'info' | 'warn' | 'error' | 'success';
}

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

interface UseSocketOptions {
  /** Limit how many events to keep in memory (default 100) */
  maxEvents?: number;
  /** Auto-reconnect on disconnect (default true) */
  autoReconnect?: boolean;
}

/* ===========================================================
   HOOK
=========================================================== */

export function useSocket(
  userId?: string,
  options: UseSocketOptions = {},
) {
  const { maxEvents = 100, autoReconnect = true } = options;

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [latency, setLatency] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /* -------- Emit / Send -------- */
  const emit = useCallback((event: string, data?: unknown) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  /* -------- Clear Events -------- */
  const clearEvents = useCallback(() => setEvents([]), []);

  /* -------- Lifecycle -------- */
  useEffect(() => {
    if (!userId) return;

    setStatus('connecting');

    const socket = io(
      process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000',
      {
        reconnection: autoReconnect,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        auth: { userId },
      },
    );

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setStatus('connected');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setStatus('disconnected');
    });

    socket.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.on('reconnect_failed', () => setStatus('error'));
    socket.on('connect_error', () => setStatus('error'));

    /* Agent events */
    socket.on('agent:event', (payload: Omit<AgentEvent, 'at'>) => {
      setEvents((prev) => {
        const next: AgentEvent = {
          ...payload,
          at: new Date().toISOString(),
        };
        return [next, ...prev].slice(0, maxEvents);
      });
    });

    /* Latency ping */
    pingIntervalRef.current = setInterval(() => {
      if (socket.connected) {
        const start = Date.now();
        socket.emit('ping', null, () => {
          setLatency(Date.now() - start);
        });
      }
    }, 5000);

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, autoReconnect, maxEvents]);

  return {
    connected,
    status,
    events,
    latency,
    emit,
    clearEvents,
  };
}