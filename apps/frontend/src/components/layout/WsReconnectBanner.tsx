'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { wsService } from '@/services/websocket.service';

type BannerState = 'idle' | 'disconnected' | 'reconnected';

export function WsReconnectBanner() {
  const [state, setState] = useState<BannerState>('idle');

  useEffect(() => {
    let off1: () => void = () => {};
    let off2: () => void = () => {};
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    // Delay subscription so SocketProvider has time to initialize the socket
    const initTimer = setTimeout(() => {
      off1 = wsService.on('disconnect', () => {
        if (hideTimer) clearTimeout(hideTimer);
        setState('disconnected');
      });

      off2 = wsService.on('connect', () => {
        if (hideTimer) clearTimeout(hideTimer);
        setState('reconnected');
        hideTimer = setTimeout(() => setState('idle'), 2500);
      });
    }, 300);

    return () => {
      clearTimeout(initTimer);
      if (hideTimer) clearTimeout(hideTimer);
      off1();
      off2();
    };
  }, []);

  if (state === 'idle') return null;

  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-center justify-center gap-2 py-2 text-xs font-semibold transition-all',
        state === 'disconnected'
          ? 'bg-amber-500/10 border-b border-amber-500/20 text-amber-300'
          : 'bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-300',
      )}
    >
      {state === 'disconnected' ? (
        <>
          <WifiOff className="h-3.5 w-3.5 animate-pulse" />
          Connection lost — reconnecting…
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Reconnected
        </>
      )}
    </div>
  );
}
