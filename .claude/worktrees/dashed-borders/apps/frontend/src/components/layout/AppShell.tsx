'use client';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { WsReconnectBanner } from './WsReconnectBanner';
import { SocketProvider } from '@/providers/SocketProvider';

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SocketProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-black text-white">
        {/* SIDEBAR - Fixed on left */}
        <Sidebar />

        {/* MAIN CONTAINER - Header + Scrollable Content */}
        <div className="flex flex-1 flex-col h-screen overflow-hidden">
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