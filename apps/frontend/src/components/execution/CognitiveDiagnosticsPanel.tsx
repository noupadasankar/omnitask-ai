'use client';

import React, { useMemo } from 'react';
import { useAgentStore } from '@/store/agent.store';

// ─── Types (mirror store slice) ───────────────────────────────────────────────

type GateEvent = {
  stepIndex: number;
  decision: 'proceed' | 'warn' | 'pause' | 'abort';
  systemConfidence: number;
  profile: string;
  reasoning: string;
  weakestNode: { source: string; confidence: number } | null;
  thresholds: { abort: number; pause: number; warn: number };
  timestamp: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DECISION_META = {
  proceed: { color: '#22d3ee', icon: '✓', label: 'Proceed'  },
  warn:    { color: '#f59e0b', icon: '⚡', label: 'Warning'  },
  pause:   { color: '#8b5cf6', icon: '⏸', label: 'Paused'   },
  abort:   { color: '#ef4444', icon: '🛑', label: 'Abort'    },
} as const;

function profileColor(p: string): string {
  if (p === 'conservative') return '#818cf8';
  if (p === 'aggressive')   return '#f87171';
  return '#22d3ee';
}

function profileLabel(p: string): string {
  if (p === 'conservative') return '🛡 Conservative';
  if (p === 'aggressive')   return '⚡ Aggressive';
  return '⚖ Balanced';
}

function sourceLabel(src: string): string {
  const map: Record<string, string> = {
    planner: 'Planner',
    dom_sensor: 'DOM Sensor',
    vision_sensor: 'Vision',
    drift: 'Trajectory',
    wso: 'World State',
    verifier: 'Verifier',
    strategy: 'Strategy',
    policy: 'Policy',
  };
  return map[src] ?? src;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceArc({
  value,
  color,
  size = 64,
}: {
  value: number;
  color: string;
  size?: number;
}) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, value)) * circ;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.07)" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={4}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.3s ease' }}
      />
      <text x="50%" y="50%"
        textAnchor="middle" dominantBaseline="central"
        style={{
          transform: 'rotate(90deg)',
          transformOrigin: 'center',
          fontSize: 11,
          fontWeight: 700,
          fill: color,
          fontFamily: 'monospace',
        }}>
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

function ThresholdBar({
  confidence,
  thresholds,
}: {
  confidence: number;
  thresholds: { abort: number; pause: number; warn: number };
}) {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const pos  = (v: number) => `${Math.min(98, Math.max(2, v * 100))}%`;
  const cur  = Math.min(98, Math.max(2, confidence * 100));

  return (
    <div style={{ position: 'relative', height: 28 }}>
      {/* Track */}
      <div style={{
        position: 'absolute', top: 12, left: 0, right: 0,
        height: 4, borderRadius: 2,
        background: 'linear-gradient(90deg, #ef444430 0%, #f59e0b30 25%, #22d3ee20 60%, #22d3ee40 100%)',
      }} />

      {/* Zone fills */}
      <div style={{
        position: 'absolute', top: 12, left: 0,
        width: pos(thresholds.abort), height: 4,
        background: '#ef444450', borderRadius: '2px 0 0 2px',
      }} />
      <div style={{
        position: 'absolute', top: 12,
        left: pos(thresholds.abort),
        width: `${(thresholds.pause - thresholds.abort) * 100}%`,
        height: 4, background: '#8b5cf650',
      }} />
      <div style={{
        position: 'absolute', top: 12,
        left: pos(thresholds.pause),
        width: `${(thresholds.warn - thresholds.pause) * 100}%`,
        height: 4, background: '#f59e0b40',
      }} />

      {/* Threshold tick marks */}
      {([
        { v: thresholds.abort, color: '#ef4444', label: `abort ${pct(thresholds.abort)}` },
        { v: thresholds.pause, color: '#8b5cf6', label: `pause ${pct(thresholds.pause)}` },
        { v: thresholds.warn,  color: '#f59e0b', label: `warn ${pct(thresholds.warn)}`  },
      ] as const).map(({ v, color, label }) => (
        <div key={label} style={{
          position: 'absolute', left: pos(v),
          top: 6, transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{ width: 1, height: 12, background: color, opacity: 0.6 }} />
        </div>
      ))}

      {/* Current confidence cursor */}
      <div style={{
        position: 'absolute', top: 8,
        left: `${cur}%`, transform: 'translateX(-50%)',
        width: 8, height: 8, borderRadius: '50%',
        background: confidence < thresholds.abort ? '#ef4444' :
                    confidence < thresholds.pause ? '#8b5cf6' :
                    confidence < thresholds.warn  ? '#f59e0b' : '#22d3ee',
        boxShadow: `0 0 8px ${confidence < thresholds.abort ? '#ef4444' :
                               confidence < thresholds.pause ? '#8b5cf6' :
                               confidence < thresholds.warn  ? '#f59e0b' : '#22d3ee'}`,
        transition: 'left 0.4s ease',
        zIndex: 10,
      }} />

      {/* Labels row */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between',
        fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace',
      }}>
        <span>0%</span>
        <span style={{ color: '#ef444460' }}>{pct(thresholds.abort)}</span>
        <span style={{ color: '#8b5cf660' }}>{pct(thresholds.pause)}</span>
        <span style={{ color: '#f59e0b60' }}>{pct(thresholds.warn)}</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function GateEventCard({ event, isLatest }: { event: GateEvent; isLatest: boolean }) {
  const meta  = DECISION_META[event.decision];
  const pCol  = profileColor(event.profile);
  const ts    = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div style={{
      display: 'flex',
      gap: 12,
      padding: '10px 12px',
      borderRadius: 10,
      background: `${meta.color}08`,
      border: `1px solid ${meta.color}${isLatest ? '40' : '20'}`,
      position: 'relative',
      overflow: 'hidden',
      transition: 'border-color 0.3s ease',
    }}>
      {/* Left accent */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, background: meta.color,
        borderRadius: '3px 0 0 3px',
        opacity: isLatest ? 1 : 0.4,
      }} />

      {/* Arc gauge */}
      <div style={{ flexShrink: 0, paddingLeft: 4 }}>
        <ConfidenceArc value={event.systemConfidence} color={meta.color} size={56} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, color: meta.color,
              textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'monospace',
            }}>
              {event.decision}
            </span>
            <span style={{
              fontSize: 8, padding: '1px 6px', borderRadius: 8,
              background: `${pCol}12`, color: pCol,
              border: `1px solid ${pCol}25`, fontFamily: 'monospace',
            }}>
              {profileLabel(event.profile)}
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
              step {event.stepIndex}
            </span>
          </div>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
            {ts}
          </span>
        </div>

        {/* Threshold bar */}
        <ThresholdBar confidence={event.systemConfidence} thresholds={event.thresholds} />

        {/* Reasoning */}
        <p style={{
          margin: 0, fontSize: 10,
          color: 'rgba(255,255,255,0.5)',
          lineHeight: 1.6, fontFamily: 'monospace',
        }}>
          {event.reasoning}
        </p>

        {/* Weakest node */}
        {event.weakestNode && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            alignSelf: 'flex-start',
          }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>WEAKEST:</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>
              {sourceLabel(event.weakestNode.source)}
            </span>
            <span style={{ fontSize: 9, color: '#f59e0b80', fontFamily: 'monospace' }}>
              {(event.weakestNode.confidence * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryGrid({ events }: { events: GateEvent[] }) {
  const counts = { proceed: 0, warn: 0, pause: 0, abort: 0 };
  for (const e of events) counts[e.decision]++;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
      {(['proceed', 'warn', 'pause', 'abort'] as const).map((d) => {
        const { color, icon, label } = DECISION_META[d];
        const active = counts[d] > 0;
        return (
          <div key={d} style={{
            background: active ? `${color}10` : 'rgba(255,255,255,0.02)',
            border: `1px solid ${active ? color + '30' : 'rgba(255,255,255,0.05)'}`,
            borderRadius: 8, padding: '7px 10px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          }}>
            <span style={{ fontSize: 12 }}>{icon}</span>
            <span style={{
              fontSize: 17, fontWeight: 800, fontFamily: 'monospace',
              color: active ? color : 'rgba(255,255,255,0.15)',
            }}>
              {counts[d]}
            </span>
            <span style={{
              fontSize: 7, color: 'rgba(255,255,255,0.25)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CognitiveDiagnosticsPanel() {
  const events  = useAgentStore((s) => s.cpnGateEvents);
  const phase   = useAgentStore((s) => s.phase);
  const profile = useAgentStore((s) => s.executionProfile);

  const isActive = phase === 'executing' || phase === 'planning' ||
                   phase === 'waiting_approval' || phase === 'waiting_otp';

  const latest = events[events.length - 1];
  const sorted = useMemo(() => [...events].reverse().slice(0, 10), [events]);

  if (!isActive && events.length === 0) return null;

  const latestColor = latest ? DECISION_META[latest.decision].color : '#8b5cf6';

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(12,8,30,0.98) 0%, rgba(8,12,28,0.98) 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16,
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow — shifts by latest decision */}
      <div style={{
        position: 'absolute', bottom: -50, left: -50,
        width: 200, height: 200, borderRadius: '50%',
        background: `radial-gradient(circle, ${latestColor}08 0%, transparent 70%)`,
        pointerEvents: 'none',
        transition: 'background 0.6s ease',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isActive ? latestColor : 'rgba(255,255,255,0.15)',
            boxShadow: isActive ? `0 0 8px ${latestColor}` : 'none',
            transition: 'background 0.4s ease, box-shadow 0.4s ease',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: 'rgba(255,255,255,0.8)',
            letterSpacing: '0.07em', textTransform: 'uppercase',
          }}>
            CPN · Cognitive Gate
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {latest && (
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 10,
              background: `${latestColor}15`, color: latestColor,
              border: `1px solid ${latestColor}30`,
              fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', fontFamily: 'monospace',
            }}>
              Last: {latest.decision}
            </span>
          )}
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace',
          }}>
            {events.length} eval{events.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Empty state */}
      {events.length === 0 && isActive && (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 6, padding: '16px 0',
          color: 'rgba(255,255,255,0.2)',
        }}>
          <span style={{ fontSize: 22 }}>🧠</span>
          <span style={{ fontSize: 11 }}>Awaiting first gate evaluation…</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', fontFamily: 'monospace' }}>
            CPN activates from step 1 — profile: {profileLabel(profile)}
          </span>
        </div>
      )}

      {/* Summary + event log */}
      {events.length > 0 && (
        <>
          <SummaryGrid events={events} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{
              fontSize: 9, color: 'rgba(255,255,255,0.28)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Gate Decision History
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 340, overflowY: 'auto' }}>
              {sorted.map((e, i) => (
                <GateEventCard key={e.timestamp} event={e} isLatest={i === 0} />
              ))}
            </div>
          </div>

          {/* Profile threshold legend */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
              Profile:{' '}
              <strong style={{ color: profileColor(profile) }}>
                {profileLabel(profile)}
              </strong>
            </span>
            {latest && (
              <ThresholdBar
                confidence={latest.systemConfidence}
                thresholds={latest.thresholds}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
