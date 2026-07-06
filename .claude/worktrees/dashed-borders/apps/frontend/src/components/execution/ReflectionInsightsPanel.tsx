'use client';

import React, { useMemo } from 'react';
import { useAgentStore } from '@/store/agent.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReflectionInsight {
  type: 'negative_invariant' | 'shortcut' | 'pattern' | 'warning';
  key: string;
  value: string;
  source: string;
  confidence?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function insightColor(type: ReflectionInsight['type']): string {
  if (type === 'negative_invariant') return '#ef4444';
  if (type === 'shortcut')           return '#22d3ee';
  if (type === 'pattern')            return '#6366f1';
  return '#f59e0b';
}

function insightIcon(type: ReflectionInsight['type']): string {
  if (type === 'negative_invariant') return '✗';
  if (type === 'shortcut')           return '⚡';
  if (type === 'pattern')            return '◈';
  return '⚠';
}

function insightLabel(type: ReflectionInsight['type']): string {
  if (type === 'negative_invariant') return 'Negative Invariant';
  if (type === 'shortcut')           return 'Optimal Shortcut';
  if (type === 'pattern')            return 'Strategy Pattern';
  return 'Warning';
}

// Parse ReflectionService log entries from the store
function parseReflectionLogs(logs: any[]): ReflectionInsight[] {
  const insights: ReflectionInsight[] = [];

  for (const log of logs) {
    if (!log.source?.includes('Reflection') && !log.source?.includes('StrategyMemory')) continue;

    const msg: string = log.message || '';

    // Negative invariants: "Negative invariant stored: selector '#btn-pay' failed 2x"
    if (msg.toLowerCase().includes('negative invariant')) {
      insights.push({
        type: 'negative_invariant',
        key: `inv_${log.id}`,
        value: msg.replace(/negative invariant\s*(stored)?:?\s*/i, '').trim(),
        source: log.source,
        confidence: 1.0,
      });
      continue;
    }

    // Shortcuts: "Optimal shortcut: skip re-auth if session cookie valid"
    if (msg.toLowerCase().includes('shortcut') || msg.toLowerCase().includes('optimal')) {
      insights.push({
        type: 'shortcut',
        key: `sc_${log.id}`,
        value: msg.replace(/(optimal\s*shortcut|shortcut):?\s*/i, '').trim(),
        source: log.source,
        confidence: 0.85,
      });
      continue;
    }

    // Patterns recalled from StrategyMemory
    if (log.source === 'StrategyMemory' && msg.toLowerCase().includes('recalled')) {
      const countMatch = msg.match(/(\d+)\s+strategy/);
      insights.push({
        type: 'pattern',
        key: `pat_${log.id}`,
        value: msg,
        source: log.source,
        confidence: countMatch ? Math.min(0.95, parseInt(countMatch[1]) * 0.15 + 0.6) : 0.7,
      });
    }
  }

  return insights;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: ReflectionInsight }) {
  const color = insightColor(insight.type);
  const icon  = insightIcon(insight.type);
  const label = insightLabel(insight.type);

  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 10,
      background: `${color}08`,
      border: `1px solid ${color}20`,
      position: 'relative',
    }}>
      {/* Icon */}
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        background: `${color}15`,
        border: `1px solid ${color}25`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        color,
        flexShrink: 0,
        fontFamily: 'monospace',
        fontWeight: 700,
      }}>
        {icon}
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}>
            {label}
          </span>
          {insight.confidence != null && (
            <span style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.25)',
              fontFamily: 'monospace',
            }}>
              {(insight.confidence * 100).toFixed(0)}% conf
            </span>
          )}
        </div>
        <p style={{
          margin: 0,
          fontSize: 11,
          color: 'rgba(255,255,255,0.6)',
          lineHeight: 1.6,
        }}>
          {insight.value}
        </p>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
          {insight.source}
        </span>
      </div>

      {/* Confidence pip */}
      {insight.confidence != null && (
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 2,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '0 0 10px 10px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${insight.confidence * 100}%`,
            background: color,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}
    </div>
  );
}

function CategoryGroup({
  type,
  insights,
}: {
  type: ReflectionInsight['type'];
  insights: ReflectionInsight[];
}) {
  if (insights.length === 0) return null;
  const color = insightColor(type);
  const label = insightLabel(type);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: color }} />
        <span style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {label}s ({insights.length})
        </span>
      </div>
      {insights.map((ins) => <InsightCard key={ins.key} insight={ins} />)}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReflectionInsightsPanel() {
  const logs  = useAgentStore((s) => s.logs);
  const phase = useAgentStore((s) => s.phase);

  const insights = useMemo(() => parseReflectionLogs(logs), [logs]);

  // Group by type
  const byType = useMemo(() => ({
    shortcut:           insights.filter((i) => i.type === 'shortcut'),
    pattern:            insights.filter((i) => i.type === 'pattern'),
    negative_invariant: insights.filter((i) => i.type === 'negative_invariant'),
    warning:            insights.filter((i) => i.type === 'warning'),
  }), [insights]);

  const isPostRun = phase === 'completed' || phase === 'failed';
  const hasInsights = insights.length > 0;

  if (!hasInsights) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(10,12,30,0.98) 0%, rgba(5,10,25,0.98) 100%)',
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
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: -50, right: -50, width: 160, height: 160,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔬</span>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.8)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
          }}>
            Reflection Engine · Post-Run Insights
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 9,
            padding: '2px 8px',
            borderRadius: 10,
            background: isPostRun ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
            color: isPostRun ? '#818cf8' : 'rgba(255,255,255,0.3)',
            border: `1px solid ${isPostRun ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {isPostRun ? 'Debrief Complete' : 'Live Capture'}
          </span>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        {[
          { count: byType.shortcut.length,           label: 'Shortcuts',  color: '#22d3ee' },
          { count: byType.pattern.length,            label: 'Patterns',   color: '#6366f1' },
          { count: byType.negative_invariant.length, label: 'Invariants', color: '#ef4444' },
          { count: byType.warning.length,            label: 'Warnings',   color: '#f59e0b' },
        ].map(({ count, label, color }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
            <span style={{
              fontSize: 18,
              fontWeight: 800,
              fontFamily: 'monospace',
              color: count > 0 ? color : 'rgba(255,255,255,0.12)',
            }}>
              {count}
            </span>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Grouped insight cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CategoryGroup type="shortcut"           insights={byType.shortcut} />
        <CategoryGroup type="pattern"            insights={byType.pattern} />
        <CategoryGroup type="negative_invariant" insights={byType.negative_invariant} />
        <CategoryGroup type="warning"            insights={byType.warning} />
      </div>

      {/* Footer note */}
      <div style={{
        fontSize: 9,
        color: 'rgba(255,255,255,0.18)',
        fontFamily: 'monospace',
        lineHeight: 1.6,
        borderTop: '1px solid rgba(255,255,255,0.04)',
        paddingTop: 10,
      }}>
        Insights are stored as <strong style={{ color: 'rgba(255,255,255,0.3)' }}>AgentMemory</strong> records and automatically
        recalled by the Planner on future executions with similar goals.
      </div>
    </div>
  );
}
