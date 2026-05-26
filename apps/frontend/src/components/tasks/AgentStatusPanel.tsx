'use client';

import { AgentEvent } from '@/hooks/useSocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff } from 'lucide-react';

export function AgentStatusPanel({
  connected,
  events,
}: {
  connected: boolean;
  events: AgentEvent[];
}) {
  return (
    <Card className="border-slate-700 bg-slate-900/60 h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-white flex items-center justify-between text-base">
          Agent Live Feed
          <Badge variant="outline" className={connected ? 'border-emerald-500 text-emerald-400' : 'border-slate-600'}>
            {connected ? (
              <>
                <Wifi className="h-3 w-3 mr-1" /> Live
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 mr-1" /> Offline
              </>
            )}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-96 space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">Waiting for agent events...</p>
        ) : (
          events.map((ev, i) => (
            <div
              key={`${ev.at}-${i}`}
              className="text-xs rounded border border-slate-800 bg-slate-950 p-2"
            >
              <div className="flex justify-between text-slate-500 mb-1">
                <span className="font-mono text-emerald-400/80">{ev.event}</span>
                <span>{new Date(ev.at).toLocaleTimeString()}</span>
              </div>
              <pre className="text-slate-400 whitespace-pre-wrap break-all">
                {JSON.stringify(ev.data, null, 2)}
              </pre>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
