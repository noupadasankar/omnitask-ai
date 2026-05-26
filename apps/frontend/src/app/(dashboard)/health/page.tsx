'use client';

import { useQuery } from '@tanstack/react-query';
import { healthApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Server } from 'lucide-react';

export default function HealthPage() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await healthApi.get()).data,
    refetchInterval: 10000,
  });

  const { data: info } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => (await healthApi.systemInfo()).data,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Server className="h-8 w-8 text-emerald-400" />
        <h1 className="text-3xl font-bold text-white">System Health</h1>
      </div>

      <Card className="border-slate-700 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            Overall
            <span
              className={
                health?.status === 'healthy'
                  ? 'text-emerald-400 text-sm font-normal'
                  : 'text-amber-400 text-sm font-normal'
              }
            >
              {health?.status}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {health?.checks &&
            Object.entries(health.checks).map(([name, check]) => (
              <div
                key={name}
                className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0"
              >
                <span className="text-slate-300 capitalize">{name}</span>
                <span className="text-sm">
                  <span
                    className={
                      check.status === 'up' ? 'text-emerald-400' : 'text-red-400'
                    }
                  >
                    {check.status}
                  </span>
                  {check.latencyMs != null && (
                    <span className="text-slate-500 ml-2">{check.latencyMs}ms</span>
                  )}
                </span>
              </div>
            ))}
        </CardContent>
      </Card>

      {info && (
        <Card className="border-slate-700 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="text-white">Platform Info</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-slate-400">{JSON.stringify(info, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
