'use client';

import React, { useMemo } from 'react';
import { useAgentStore } from '@/store/agent.store';

// ─── Utility helpers ──────────────────────────────────────────────────────────

function clamp(val: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, val));
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return '#22d3ee'; // cyan — high confidence
  if (c >= 0.5) return '#f59e0b'; // amber — medium
  return '#ef4444';               // red   — low / decayed
}

function driftTypeColor(t: string): string {
  if (t === 'EXPLORATION')       return '#6366f1'; // indigo
  if (t === 'CONSTRAINT_INDUCED') return '#f59e0b'; // amber
  return '#ef4444';                                 // red / DISTRACTION
}

function driftTypeLabel(t: string): string {
  if (t === 'EXPLORATION')       return 'Exploration';
  if (t === 'CONSTRAINT_INDUCED') return 'Constraint';
  return 'Distraction';
}

function sourceIcon(src: string): string {
  if (src === 'DOM_DIRECT')      return '⬡';
  if (src === 'VISION_INFERRED') return '👁';
  if (src === 'NETWORK_PAYLOAD') return '⇅';
  return '◎'; // USER_ASSERTED
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ConfidenceRingProps {
  value: number; // 0–1
  size?: number;
  label: string;
  sublabel?: string;
}

function ConfidenceRing({ value, size = 72, label, sublabel }: ConfidenceRingProps) {
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const filled = clamp(value) * circ;
  const color = confidenceColor(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease' }}
        />
        {/* Value text */}
        <text
          x="50%" y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: size < 64 ? 11 : 13, fontWeight: 700, fill: color, fontFamily: 'monospace' }}
        >
          {Math.round(clamp(value) * 100)}%
        </text>
      </svg>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>{label}</span>
      {sublabel && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>{sublabel}</span>}
    </div>
  );
}

interface BeliefCellProps {
  label: string;
  value: any;
  confidence: number;
  source: string;
}

function BeliefCell({ label, value, confidence, source }: BeliefCellProps) {
  const color = confidenceColor(confidence);
  const displayVal = typeof value === 'boolean' ? (value ? 'TRUE' : 'false') :
                     typeof value === 'number' ? value.toFixed(2) :
                     String(value);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${color}30`,
      borderRadius: 8,
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Confidence bar at bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        height: 2,
        width: `${clamp(confidence) * 100}%`,
        background: color,
        transition: 'width 0.5s ease',
        borderRadius: '0 2px 2px 0',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{sourceIcon(source)}</span>
      </div>
      <span style={{
        fontSize: 12,
        fontWeight: 600,
        color: typeof value === 'boolean' && value ? '#22d3ee' : typeof value === 'boolean' ? 'rgba(255,255,255,0.35)' : color,
        fontFamily: 'monospace',
      }}>
        {displayVal}
      </span>
    </div>
  );
}

interface DriftSparklineProps {
  records: Array<{ similarity: number; isDrifted: boolean; type: string; phase: string; stepIndex: number }>;
}

function DriftSparkline({ records }: DriftSparklineProps) {
  const W = 280, H = 50;
  const pts = records.slice(-20);
  if (pts.length < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
        Awaiting trajectory data…
      </div>
    );
  }

  const stepW = W / (pts.length - 1);

  const pathD = pts.map((p, i) => {
    const x = i * stepW;
    const y = H - clamp(p.similarity) * H;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Phase threshold bands */}
      <line x1={0} y1={H - 0.85 * H} x2={W} y2={H - 0.85 * H} stroke="rgba(239,68,68,0.2)" strokeDasharray="4 3" strokeWidth={1} />
      <line x1={0} y1={H - 0.65 * H} x2={W} y2={H - 0.65 * H} stroke="rgba(245,158,11,0.2)" strokeDasharray="4 3" strokeWidth={1} />
      <line x1={0} y1={H - 0.40 * H} x2={W} y2={H - 0.40 * H} stroke="rgba(99,102,241,0.2)" strokeDasharray="4 3" strokeWidth={1} />

      {/* Gradient fill */}
      <defs>
        <linearGradient id="drift-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25} />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <path d={`${pathD} L ${((pts.length - 1) * stepW).toFixed(1)} ${H} L 0 ${H} Z`} fill="url(#drift-fill)" />

      {/* Main trajectory line */}
      <path d={pathD} fill="none" stroke="#22d3ee" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* Data points — color by drift type */}
      {pts.map((p, i) => {
        const x = i * stepW;
        const y = H - clamp(p.similarity) * H;
        const col = p.isDrifted ? driftTypeColor(p.type) : '#22d3ee';
        return <circle key={i} cx={x} cy={y} r={p.isDrifted ? 3.5 : 2} fill={col} opacity={0.9} />;
      })}
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WorldStateHud() {
  const worldState     = useAgentStore((s) => s.worldState);
  const driftRecords   = useAgentStore((s) => s.driftRecords);
  const driftAbort     = useAgentStore((s) => s.driftAbort);
  const profile        = useAgentStore((s) => s.executionProfile);
  const phase          = useAgentStore((s) => s.phase);

  const isActive = phase === 'executing' || phase === 'planning' || phase === 'waiting_approval' || phase === 'waiting_otp';
  const latestDrift = driftRecords[driftRecords.length - 1];

  const beliefEntries = useMemo(() => {
    if (!worldState?.belief) return [];
    return Object.entries(worldState.belief).map(([key, v]) => ({
      key,
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
      value: v.value,
      confidence: v.confidence,
      source: v.source,
    }));
  }, [worldState]);

  if (!isActive && !worldState && driftRecords.length === 0) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(15,15,25,0.98) 0%, rgba(10,20,35,0.98) 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16,
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: -60, right: -60, width: 200, height: 200,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isActive ? '#22d3ee' : 'rgba(255,255,255,0.2)',
            boxShadow: isActive ? '0 0 8px #22d3ee' : 'none',
            animation: isActive ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Cognitive OS · World State
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 9,
            padding: '2px 8px',
            borderRadius: 20,
            background: profile === 'conservative' ? 'rgba(99,102,241,0.2)' :
                        profile === 'aggressive'   ? 'rgba(239,68,68,0.2)' :
                                                     'rgba(34,211,238,0.15)',
            color: profile === 'conservative' ? '#818cf8' :
                   profile === 'aggressive'   ? '#f87171' :
                                                '#22d3ee',
            border: `1px solid ${profile === 'conservative' ? '#818cf820' : profile === 'aggressive' ? '#f8717120' : '#22d3ee20'}`,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
          }}>
            {profile}
          </span>
          {worldState && (
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>
              v{worldState.version}
            </span>
          )}
        </div>
      </div>

      {/* ── Confidence Gauges ── */}
      {worldState && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32 }}>
          <ConfidenceRing
            value={worldState.stateConfidence}
            size={80}
            label="State Confidence"
            sublabel="Temporal decay"
          />
          <ConfidenceRing
            value={worldState.beliefSourceConsensus}
            size={80}
            label="Source Consensus"
            sublabel="DOM ↔ Vision"
          />
          {latestDrift && (
            <ConfidenceRing
              value={latestDrift.similarity}
              size={80}
              label="Goal Alignment"
              sublabel={`Phase: ${latestDrift.phase}`}
            />
          )}
        </div>
      )}

      {/* ── Belief State Grid ── */}
      {beliefEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Belief State · Epistemic Envelope
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
            {beliefEntries.map(({ key, label, value, confidence, source }) => (
              <BeliefCell key={key} label={label} value={value} confidence={confidence} source={source} />
            ))}
          </div>
        </div>
      )}

      {/* ── Trajectory Drift Sparkline ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Semantic Trajectory · Goal Alignment
          </span>
          {latestDrift && (
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 20,
              background: `${driftTypeColor(latestDrift.type)}20`,
              color: driftTypeColor(latestDrift.type),
              border: `1px solid ${driftTypeColor(latestDrift.type)}30`,
              fontWeight: 700,
            }}>
              {driftTypeLabel(latestDrift.type)}
            </span>
          )}
        </div>
        <DriftSparkline records={driftRecords} />
        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          {[
            { color: '#22d3ee',  label: 'Aligned' },
            { color: '#6366f1',  label: 'Exploration' },
            { color: '#f59e0b',  label: 'Constraint' },
            { color: '#ef4444',  label: 'Distraction' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Latest Drift Explanation ── */}
      {latestDrift?.isDrifted && (
        <div style={{
          background: `${driftTypeColor(latestDrift.type)}10`,
          border: `1px solid ${driftTypeColor(latestDrift.type)}25`,
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.65)',
          lineHeight: 1.6,
        }}>
          <span style={{ fontWeight: 700, color: driftTypeColor(latestDrift.type) }}>
            {driftTypeLabel(latestDrift.type)} drift at step {latestDrift.stepIndex}:
          </span>{' '}
          {latestDrift.explanation}
        </div>
      )}

      {/* ── Drift Abort Overlay ── */}
      {driftAbort && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 12,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🛑</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f87171' }}>Cognitive Drift Abort</span>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.6 }}>
            {driftAbort.reason}
          </p>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
            Goal alignment at abort: <strong style={{ color: '#f87171' }}>{Math.round(driftAbort.similarity * 100)}%</strong>
            {' · '}
            Stopped at step <strong style={{ color: '#f87171' }}>{driftAbort.stepIndex}</strong>
          </div>
        </div>
      )}

      {/* ── Source Legend ── */}
      <div style={{ display: 'flex', gap: 16, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {[
          { icon: '⬡', label: 'DOM Direct' },
          { icon: '👁', label: 'Vision Inferred' },
          { icon: '⇅', label: 'Network Payload' },
          { icon: '◎', label: 'User Asserted' },
        ].map(({ icon, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{icon}</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{label}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
