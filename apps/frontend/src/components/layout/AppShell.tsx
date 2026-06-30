'use client';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { WsReconnectBanner } from './WsReconnectBanner';
import { SocketProvider } from '@/providers/SocketProvider';
import { CursorDots } from '@/components/ui/cursor-dots';

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SocketProvider>
      <div className="relative flex h-screen w-screen overflow-hidden bg-[#0A0A0B] text-white">
        {/* Interactive cursor-reactive dot grid — fixed behind all content */}
        <CursorDots />
        {/* Ambient red glow at viewport centre */}
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
          <div className="h-[500px] w-[500px] rounded-full bg-red-500/[0.08] blur-[120px]" />
        </div>
        {/* SIDEBAR - Fixed on left */}
        <div className="relative z-10">
          <Sidebar />
        </div>

        {/* MAIN CONTAINER - Header + Scrollable Content */}
        <div className="relative z-10 flex flex-1 flex-col h-screen overflow-hidden">
          {/* TOPBAR - Fixed at top of main container */}
          <Topbar />

          {/* WS reconnect notification — slides in on disconnect */}
          <WsReconnectBanner />

          {/* MAIN CONTENT AREA - Only this part scrolls */}
          <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-zinc-950/20">
            <div className="max-w-[1600px] mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SocketProvider>
  );
}