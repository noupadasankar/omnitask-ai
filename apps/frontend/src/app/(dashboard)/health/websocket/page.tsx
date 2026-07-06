'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { motion } from 'framer-motion';
import {
  Radio, Activity, Clock, Users, MessageSquare,
  Signal, Wifi, WifiOff, BarChart3, Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoomStat {
  name: string;
  connections: number;
  messagesPerSec: number;
}

interface ConnectionPoint {
  time: string;
  value: number;
}

interface WebSocketHealth {
  activeConnections: number;
  totalConnections: number;
  messagesPerSec: number;
  latencyMs: number;
  reconnectRate: number;
  rooms: RoomStat[];
  history: ConnectionPoint[];
}

const MOCK: WebSocketHealth = {
  activeConnections: 847,
  totalConnections: 12_400,
  messagesPerSec: 234,
  latencyMs: 8.2,
  reconnectRate: 2.1,
  rooms: [
    { name: 'agent:updates', connections: 320, messagesPerSec: 89 },
    { name: 'task:progress', connections: 215, messagesPerSec: 67 },
    { name: 'notifications', connections: 178, messagesPerSec: 42 },
    { name: 'workflow:events', connections: 89, messagesPerSec: 23 },
    { name: 'system:alerts', connections: 45, messagesPerSec: 13 },
  ],
  history: [
    { time: '14:00', value: 810 }, { time: '14:05', value: 825 },
    { time: '14:10', value: 798 }, { time: '14:15', value: 840 },
    { time: '14:20', value: 832 }, { time: '14:25', value: 847 },
    { time: '14:30', value: 855 }, { time: '14:35', value: 843 },
    { time: '14:40', value: 860 }, { time: '14:45', value: 847 },
  ],
};

function MiniLineChart({ data, color }: { data: ConnectionPoint[]; color: string }) {
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 36;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.value - min) / range) * h;
    return `${x},${y}`;
  });
  const polyline = points.join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full">
      <motion.polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polyline}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: 'easeInOut' }}
      />
    </svg>
  );
}

function StatBox({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', color ?? 'text-zinc-500')} />
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <p className={cn('mt-2 font-mono text-lg font-black', color ?? 'text-white')}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-600">{sub}</p>}
    </div>
  );
}

export default function WebSocketHealthPage() {
  const d = MOCK;
  return (
    <ErrorBoundary><Suspense fallback={<PageSkeleton />}>
    <div className="space-y-6 animate-fade-up">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
          <Radio className="h-3.5 w-3.5 text-red-400" />
          WebSocket Health
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">WebSocket</h1>
        <p className="mt-1 text-sm text-zinc-500">Real-time connections, throughput, and room activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        {[
          { icon: Signal, label: 'Active', value: String(d.activeConnections), color: 'text-emerald-400' },
          { icon: Users, label: 'Total', value: d.totalConnections.toLocaleString() },
          { icon: Activity, label: 'Msg/s', value: String(d.messagesPerSec) },
          { icon: Clock, label: 'Latency', value: `${d.latencyMs}ms`, color: d.latencyMs > 10 ? 'text-amber-400' : 'text-emerald-400' },
          { icon: Wifi, label: 'Reconnect', value: `${d.reconnectRate}%`, color: d.reconnectRate > 5 ? 'text-red-400' : 'text-zinc-400' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
            >
              <Icon className={cn('h-5 w-5', stat.color ?? 'text-zinc-400')} />
              <p className={cn('mt-3 font-mono text-2xl font-black', stat.color ?? 'text-white')}>{stat.value}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{stat.label}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Connection History</h2>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">Last 45 minutes</span>
              <span className="font-mono text-xs text-zinc-400">
                min {Math.min(...d.history.map((p) => p.value))} · max {Math.max(...d.history.map((p) => p.value))}
              </span>
            </div>
            <MiniLineChart data={d.history} color="#ef4444" />
            <div className="mt-2 flex justify-between text-[9px] text-zinc-600">
              {d.history.filter((_, i) => i % 3 === 0).map((p) => (
                <span key={p.time}>{p.time}</span>
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatBox icon={Wifi} label="Peak Connections" value={String(Math.max(...d.history.map((p) => p.value)))} color="text-emerald-400" />
            <StatBox icon={WifiOff} label="Reconnect Rate" value={`${d.reconnectRate}%`} sub="of all connections" color={d.reconnectRate > 5 ? 'text-red-400' : 'text-zinc-400'} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Hash className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Top Rooms / Channels</h2>
          </div>
          <div className="space-y-2">
            {d.rooms.map((room, i) => {
              const maxConn = Math.max(...d.rooms.map((r) => r.connections));
              const pct = room.connections / maxConn;
              return (
                <motion.div
                  key={room.name}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.06 }}
                  className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="text-xs font-semibold text-white">{room.name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-400">{room.connections} conn</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-red-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.3 + i * 0.06, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-zinc-600">{room.messagesPerSec}/s</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
    </Suspense></ErrorBoundary>
  );
}
