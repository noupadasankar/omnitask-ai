'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Wifi, WifiOff, Cpu } from 'lucide-react';

import { useSocket } from '@/providers/SocketProvider';
import { useAuth } from '@/hooks/useAuth';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/tasks': 'Tasks',
  '/tasks/create': 'New Task',
  '/monitor': 'Agent Monitor',
  '/agents': 'Agent Registry',
  '/approvals': 'Approvals',
  '/execution/history': 'Execution History',
  '/execution/schedules': 'Schedules',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
};

function resolveTitle(pathname: string): string {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Dynamic routes like /tasks/[id] or /execution/replay/[id]
  if (pathname.startsWith('/tasks/') && pathname !== '/tasks/create') return 'Task Detail';
  if (pathname.startsWith('/execution/replay/')) return 'Execution Replay';
  if (pathname.startsWith('/settings/')) return 'Settings';
  if (pathname.startsWith('/analytics/')) return 'Analytics';
  return 'OmniTask';
}

export function Topbar() {
  const pathname = usePathname();
  const { isConnected } = useSocket();
  const { user } = useAuth();

  const title = useMemo(() => resolveTitle(pathname), [pathname]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] bg-black/20 px-6 backdrop-blur-2xl">
      {/* Left: page title */}
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold text-white">{title}</h1>
      </div>

      {/* Right: connection status + user */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
          {isConnected ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] font-medium text-emerald-400">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-[11px] font-medium text-zinc-500">Offline</span>
            </>
          )}
        </div>

        {/* Runtime status indicator */}
        <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
          <Cpu className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-[11px] font-medium text-zinc-400">Runtime</span>
        </div>

        {/* User avatar */}
        {user && (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-[10px] font-bold text-white">
              {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
