'use client';

import React from 'react';
import { useAgentStore } from '@/store/agent.store';

// ─── Helpers & Configurations ──────────────────────────────────────────────────

const OUTCOME_CONFIG = {
  SUCCESS: {
    color: '#22d3ee', // Cyan
    bgGlow: 'rgba(34,211,238,0.06)',
    border: 'rgba(34,211,238,0.25)',
    icon: '✓',
    title: 'Goal Completed Successfully',
    label: 'Success',
  },
  SAFE_ABORT: {
    color: '#f59e0b', // Amber
    bgGlow: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.25)',
    icon: '🛡',
    title: 'Cognitive Safe Abort',
    label: 'Abort',
  },
  ESCALATED: {
    color: '#8b5cf6', // Purple
    bgGlow: 'rgba(139,92,246,0.06)',
    border: 'rgba(139,92,246,0.25)',
    icon: '⏸',
    title: 'Human Escalation Terminated',
    label: 'Escalation',
  },
  FAILED: {
    color: '#ef4444', // Red
    bgGlow: 'rgba(239,68,68,0.06)',
    border: 'rgba(239,68,68,0.25)',
    icon: '🛑',
    title: 'System Execution Failed',
    label: 'Failure',
  },
} as const;

// ─── Main Component ─────────────────────────────────────────────────────────────

export function CognitiveOutcomePanel() {
  const outcome = useAgentStore((s) => s.cognitiveOutcome);
  const phase = useAgentStore((s) => s.phase);

  // Render outcome if explicitly populated, or show summary on terminal states
  if (!outcome) {
    return null;
  }

  const config = OUTCOME_CONFIG[outcome.type] || OUTCOME_CONFIG.FAILED;
  const timeStr = new Date(outcome.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const dateStr = new Date(outcome.timestamp).toLocaleDateString([], {
    month: 'short', day: 'numeric',
  });

  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(10,5,28,0.98) 0%, rgba(5,8,22,0.98) 100%)`,
      border: `1px solid ${config.border}`,
      borderRadius: 16,
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `0 8px 32px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.05)`,
    }}>
      {/* Background Ambient Glow */}
      <div style={{
        position: 'absolute', top: -100, left: -100,
        width: 300, height: 300, borderRadius: '50%',
        background: `radial-gradient(circle, ${config.bgGlow} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: `${config.color}15`,
            border: `1px solid ${config.color}35`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 'bold',
            color: config.color,
          }}>
            {config.icon}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: 'monospace',
            }}>
              Cognitive OS · Execution Result
            </span>
            <span style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.01em',
            }}>
              {config.title}
            </span>
          </div>
        </div>

        <div style={{
          fontSize: 9,
          padding: '3px 10px',
          borderRadius: 20,
          background: `${config.color}15`,
          color: config.color,
          border: `1px solid ${config.color}25`,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          fontFamily: 'monospace',
        }}>
          {config.label}
        </div>
      </div>

      {/* Explanation / Rationale */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: 10,
        padding: '12px 16px',
        zIndex: 1,
      }}>
        <div style={{
          fontSize: 8,
          color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          marginBottom: 6,
          fontFamily: 'monospace',
        }}>
          Exit Judgment & Rationale
        </div>
        <p style={{
          margin: 0,
          fontSize: 11,
          color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.6,
          fontFamily: 'monospace',
          whiteSpace: 'pre-line',
        }}>
          {outcome.explanation}
        </p>
      </div>

      {/* Exit Telemetry Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        borderTop: '1px solid rgba(255,255,255,0.05)',
        zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>EXIT CONFIDENCE</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: config.color, fontFamily: 'monospace' }}>
              {Math.round(outcome.confidence * 100)}%
            </span>
          </div>
          {/* Small progress bar */}
          <div style={{ width: 64, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
            <div style={{
              width: `${outcome.confidence * 100}%`,
              height: '100%',
              background: config.color,
              borderRadius: 2,
              boxShadow: `0 0 6px ${config.color}`,
            }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>COMPLETED AT</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
            {dateStr} {timeStr}
          </span>
        </div>
      </div>
    </div>
  );
}
