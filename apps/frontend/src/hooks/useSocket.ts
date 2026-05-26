'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

export interface AgentEvent {
  event: string;
  data: unknown;
  at: string;
}

export function useSocket(userId?: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);

  const pushEvent = useCallback((event: string, data: unknown) => {
    setEvents((prev) => [
      { event, data, at: new Date().toISOString() },
      ...prev.slice(0, 199),
    ]);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      auth: { userId },
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    const agentEvents = [
      'agent:started',
      'agent:step:start',
      'agent:step:result',
      'agent:step:error',
      'agent:completed',
      'agent:error',
      'agent:selfheal',
      'task:execution:started',
    ];

    agentEvents.forEach((name) => {
      socket.on(name, (data) => pushEvent(name, data));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, pushEvent]);

  return { connected, events, clearEvents: () => setEvents([]) };
}
