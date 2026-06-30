// backend/src/agent/confidence-network.service.ts
//
// Confidence Propagation Network (CPN)
// ─────────────────────────────────────────────────────────────────────
// Computes end-to-end system confidence using log-space multiplication.
//
//   P(system) = Π P(sensor_i)
//   log P(system) = Σ log P(sensor_i)
//
// This correctly models the reality that every additional inference
// layer degrades total confidence. It is the core math behind the
// Cognitive Gate — profile thresholds act on the CPN output, not
// individual sensor readings.
// ─────────────────────────────────────────────────────────────────────

import { Injectable, Logger } from '@nestjs/common';

// ─── Types ────────────────────────────────────────────────────────────

export type ConfidenceSource =
  | 'planner'       // Plan quality / parsed goal clarity
  | 'dom_sensor'    // DOM skill detections (login, OTP, captcha)
  | 'vision_sensor' // Vision agent screenshot analysis
  | 'drift'         // Trajectory drift similarity
  | 'wso'           // World State Object composite confidence
  | 'verifier'      // Post-execution verification score
  | 'strategy'      // Strategy memory recall relevance
  | 'policy';       // Policy engine clearance

export interface ConfidenceNode {
  source: ConfidenceSource;
  confidence: number;         // 0.0 → 1.0
  weight: number;             // Relative importance multiplier
  timestamp: number;
  decayRatePerSec: number;    // Exponential decay λ
}

export interface CPNResult {
  systemConfidence: number;   // 0.0 → 1.0 composite
  logConfidence: number;      // Raw log-space value (for debugging)
  nodeCount: number;
  weakestNode: { source: ConfidenceSource; confidence: number } | null;
  compositeBreakdown: Array<{ source: ConfidenceSource; raw: number; decayed: number; weighted: number }>;
}

export type ExecutionProfile = 'conservative' | 'balanced' | 'aggressive';

// Profile-specific threshold constants
export interface ProfileThresholds {
  // CPN confidence below this → hard abort
  abortThreshold: number;
  // CPN confidence below this → pause for user
  pauseThreshold: number;
  // CPN confidence below this → emit warning log
  warnThreshold: number;
  // Drift similarity below this → consider drifted (before LLM classification)
  driftSimilarityFloor: number;
  // Maximum retries before giving up
  maxStepRetries: number;
  // Minimum WSO consensus to proceed without user check
  minConsensus: number;
}

export const PROFILE_THRESHOLDS: Record<ExecutionProfile, ProfileThresholds> = {
  conservative: {
    abortThreshold: 0.35,
    pauseThreshold: 0.55,
    warnThreshold: 0.70,
    driftSimilarityFloor: 0.70,
    maxStepRetries: 1,
    minConsensus: 0.75,
  },
  balanced: {
    abortThreshold: 0.20,
    pauseThreshold: 0.40,
    warnThreshold: 0.60,
    driftSimilarityFloor: 0.55,
    maxStepRetries: 3,
    minConsensus: 0.55,
  },
  aggressive: {
    abortThreshold: 0.10,
    pauseThreshold: 0.25,
    warnThreshold: 0.45,
    driftSimilarityFloor: 0.35,
    maxStepRetries: 5,
    minConsensus: 0.35,
  },
};

// ─── Service ──────────────────────────────────────────────────────────

@Injectable()
export class ConfidenceNetworkService {
  private readonly logger = new Logger(ConfidenceNetworkService.name);
  private sessions = new Map<string, Map<ConfidenceSource, ConfidenceNode>>();

  /**
   * Initialize an empty CPN for a session.
   */
  initializeSession(sessionId: string): void {
    this.sessions.set(sessionId, new Map());
    this.logger.log(`CPN initialized for session: ${sessionId}`);
  }

  /**
   * Record or update a confidence reading from a specific source.
   * Each source has exactly one node — updates replace the previous.
   */
  recordConfidence(
    sessionId: string,
    source: ConfidenceSource,
    confidence: number,
    weight = 1.0,
    decayRatePerSec = 0.005,
  ): void {
    const nodes = this.sessions.get(sessionId);
    if (!nodes) return;

    const clamped = Math.max(0.001, Math.min(1.0, confidence)); // Avoid log(0)
    nodes.set(source, {
      source,
      confidence: clamped,
      weight,
      timestamp: Date.now(),
      decayRatePerSec,
    });
  }

  /**
   * Compute the composite system confidence.
   *
   * Math (log-space weighted geometric mean):
   *   log(P_system) = Σ_i [ w_i · log(P_i · decay(t_i)) ] / Σ_i w_i
   *   P_system = exp(log(P_system))
   *
   * This correctly models that each layer compounds uncertainty.
   */
  computeSystemConfidence(sessionId: string): CPNResult {
    const nodes = this.sessions.get(sessionId);
    if (!nodes || nodes.size === 0) {
      return {
        systemConfidence: 1.0,
        logConfidence: 0,
        nodeCount: 0,
        weakestNode: null,
        compositeBreakdown: [],
      };
    }

    const now = Date.now();
    let logSum = 0;
    let weightSum = 0;
    let weakest: { source: ConfidenceSource; confidence: number } | null = null;
    const breakdown: CPNResult['compositeBreakdown'] = [];

    for (const [, node] of nodes) {
      // Apply temporal decay: C_decayed = C · e^(-λ · Δt)
      const elapsedSec = (now - node.timestamp) / 1000;
      const decayed = node.confidence * Math.exp(-node.decayRatePerSec * elapsedSec);
      const clampedDecayed = Math.max(0.001, Math.min(1.0, decayed));

      const logVal = node.weight * Math.log(clampedDecayed);
      logSum += logVal;
      weightSum += node.weight;

      breakdown.push({
        source: node.source,
        raw: node.confidence,
        decayed: clampedDecayed,
        weighted: logVal,
      });

      if (!weakest || clampedDecayed < weakest.confidence) {
        weakest = { source: node.source, confidence: clampedDecayed };
      }
    }

    const normalizedLog = weightSum > 0 ? logSum / weightSum : 0;
    const systemConfidence = Math.max(0, Math.min(1.0, Math.exp(normalizedLog)));

    return {
      systemConfidence,
      logConfidence: normalizedLog,
      nodeCount: nodes.size,
      weakestNode: weakest,
      compositeBreakdown: breakdown,
    };
  }

  /**
   * Returns profile-specific thresholds for the given execution profile.
   */
  getThresholds(profile: ExecutionProfile): ProfileThresholds {
    return PROFILE_THRESHOLDS[profile] || PROFILE_THRESHOLDS.balanced;
  }

  /**
   * Evaluate system state against profile thresholds.
   * Returns a decision: 'proceed' | 'warn' | 'pause' | 'abort'
   */
  evaluateGate(
    sessionId: string,
    profile: ExecutionProfile,
  ): {
    decision: 'proceed' | 'warn' | 'pause' | 'abort';
    systemConfidence: number;
    thresholds: ProfileThresholds;
    weakestNode: CPNResult['weakestNode'];
    reasoning: string;
  } {
    const cpn = this.computeSystemConfidence(sessionId);
    const thresholds = this.getThresholds(profile);

    let decision: 'proceed' | 'warn' | 'pause' | 'abort' = 'proceed';
    let reasoning = '';

    if (cpn.systemConfidence < thresholds.abortThreshold) {
      decision = 'abort';
      reasoning = `System confidence ${(cpn.systemConfidence * 100).toFixed(1)}% is below abort threshold ${(thresholds.abortThreshold * 100).toFixed(0)}% [profile: ${profile}]. Weakest: ${cpn.weakestNode?.source ?? 'none'} at ${((cpn.weakestNode?.confidence ?? 0) * 100).toFixed(1)}%.`;
    } else if (cpn.systemConfidence < thresholds.pauseThreshold) {
      decision = 'pause';
      reasoning = `System confidence ${(cpn.systemConfidence * 100).toFixed(1)}% is below pause threshold ${(thresholds.pauseThreshold * 100).toFixed(0)}% [profile: ${profile}]. Recommend user verification.`;
    } else if (cpn.systemConfidence < thresholds.warnThreshold) {
      decision = 'warn';
      reasoning = `System confidence ${(cpn.systemConfidence * 100).toFixed(1)}% approaching caution zone [profile: ${profile}].`;
    } else {
      reasoning = `System confidence ${(cpn.systemConfidence * 100).toFixed(1)}% is healthy [profile: ${profile}].`;
    }

    return {
      decision,
      systemConfidence: cpn.systemConfidence,
      thresholds,
      weakestNode: cpn.weakestNode,
      reasoning,
    };
  }

  /**
   * Cleanup session CPN data.
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.logger.log(`CPN cleaned up for session: ${sessionId}`);
  }
}
