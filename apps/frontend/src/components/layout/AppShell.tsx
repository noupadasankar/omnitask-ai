'use client';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* SIDEBAR */}
      <Sidebar />

      {/* MAIN */}
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />

        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}