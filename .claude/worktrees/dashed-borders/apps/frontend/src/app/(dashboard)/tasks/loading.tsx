'use client';

import { Loader2 } from 'lucide-react';

export default function TasksLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 animate-pulse">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
        <Loader2 className="h-6 w-6 text-red-500 animate-spin" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-white">Syncing Task Queues</p>
        <p className="text-xs text-zinc-500">Retrieving live agent execution streams...</p>
      </div>
    </div>
  );
}
