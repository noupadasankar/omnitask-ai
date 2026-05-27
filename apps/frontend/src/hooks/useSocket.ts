'use client';

import { io } from 'socket.io-client';

import {
  useEffect,
  useState,
} from 'react';

export interface AgentEvent {
  event: string;

  data: unknown;

  at: string;
}

export function useSocket(
  userId?: string,
) {
  const [connected, setConnected] =
    useState(false);

  const [events, setEvents] = useState<
    AgentEvent[]
  >([]);

  useEffect(() => {
    if (!userId) return;

    const socket = io(
      process.env
        .NEXT_PUBLIC_WS_URL ||
        'http://localhost:4000',
    );

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on(
      'agent:event',
      (payload) => {
        setEvents((prev) => [
          {
            ...payload,
            at: new Date().toISOString(),
          },

          ...prev,
        ]);
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [userId]);

  return {
    connected,
    events,
  };
}