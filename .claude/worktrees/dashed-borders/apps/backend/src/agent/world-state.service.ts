import { Injectable, Logger } from '@nestjs/common';

export interface RealitySnapshot {
  domHash: string;
  screenshotHash: string;
  timestamp: number;
  url: string;
}

export interface EpistemicEnvelope<T> {
  value: T;
  timestamp: number;
  version: number;
  source: 'DOM_DIRECT' | 'VISION_INFERRED' | 'NETWORK_PAYLOAD' | 'USER_ASSERTED';
  inferenceDepth: number;
  sourceConfidence: number;
}

export interface BeliefState {
  authStatus: 'guest' | 'logging_in' | 'authenticated' | 'session_expired';
  activeStage: 'discovery' | 'navigation' | 'selection' | 'transaction' | 'completed' | 'failed';
  hostilityIndex: number; // 0.0 -> 1.0
  isFormPresent: boolean;
  isModalActive: boolean;
  isCheckoutDetect: boolean;
  pageVolatility: number; // 0.0 -> 1.0 (frequency of dynamic changes)
}

export interface VersionedWorldState {
  sessionId: string;
  reality: RealitySnapshot | null;
  belief: {
    [K in keyof BeliefState]: EpistemicEnvelope<BeliefState[K]>;
  };
  stateConfidence: number; // 0.0 -> 1.0
  beliefSourceConsensus: number; // 0.0 -> 1.0
  version: number;
  history: Record<number, { reality: RealitySnapshot | null; belief: BeliefState }>;
}

@Injectable()
export class WorldStateService {
  private readonly logger = new Logger(WorldStateService.name);
  private sessions = new Map<string, VersionedWorldState>();

  // Decay coefficients for different state keys
  private readonly DECAY_RATES: Record<keyof BeliefState, number> = {
    authStatus: 0.001,    // Very slow decay
    activeStage: 0.01,    // Slow decay
    hostilityIndex: 0.005, // Slow decay
    isFormPresent: 0.03,  // Medium decay
    isModalActive: 0.05,  // Fast decay (modals can disappear)
    isCheckoutDetect: 0.02, // Medium decay
    pageVolatility: 0.01,  // Slow decay
  };

  initializeSession(sessionId: string): VersionedWorldState {
    const initialBelief: { [K in keyof BeliefState]: EpistemicEnvelope<BeliefState[K]> } = {
      authStatus: this.createEnvelope('guest', 'DOM_DIRECT', 1.0),
      activeStage: this.createEnvelope('discovery', 'DOM_DIRECT', 1.0),
      hostilityIndex: this.createEnvelope(0.0, 'DOM_DIRECT', 1.0),
      isFormPresent: this.createEnvelope(false, 'DOM_DIRECT', 1.0),
      isModalActive: this.createEnvelope(false, 'DOM_DIRECT', 1.0),
      isCheckoutDetect: this.createEnvelope(false, 'DOM_DIRECT', 1.0),
      pageVolatility: this.createEnvelope(0.0, 'DOM_DIRECT', 1.0),
    };

    const sessionState: VersionedWorldState = {
      sessionId,
      reality: null,
      belief: initialBelief,
      stateConfidence: 1.0,
      beliefSourceConsensus: 1.0,
      version: 1,
      history: {
        1: { reality: null, belief: this.extractBeliefValues(initialBelief) },
      },
    };

    this.sessions.set(sessionId, sessionState);
    this.logger.log(`Initialized World State Object (WSO) for session: ${sessionId}`);
    return sessionState;
  }

  updateReality(sessionId: string, snapshot: RealitySnapshot): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    state.reality = snapshot;
    this.logger.debug(`WSO Reality snapshot updated for ${sessionId}: DOM Hash = ${snapshot.domHash.substring(0, 8)}`);
    this.calculateConsensus(sessionId);
  }

  updateBelief<K extends keyof BeliefState>(
    sessionId: string,
    key: K,
    value: BeliefState[K],
    source: EpistemicEnvelope<any>['source'],
    sourceConfidence: number,
    inferenceDepth = 0,
  ): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    const currentEnvelope = state.belief[key];
    const newVersion = (currentEnvelope?.version || 0) + 1;

    state.belief[key] = {
      value,
      timestamp: Date.now(),
      version: newVersion,
      source,
      inferenceDepth,
      sourceConfidence,
    } as any; // TS mapped-type narrowing limitation — runtime-correct

    state.version++;
    state.history[state.version] = {
      reality: state.reality ? { ...state.reality } : null,
      belief: this.extractBeliefValues(state.belief),
    };

    this.applyTemporalDecay(sessionId);
    this.calculateConsensus(sessionId);

    this.logger.debug(
      `WSO Belief updated [${sessionId}] - version ${state.version}: ${key} = ${value} (Source: ${source}, Conf: ${sourceConfidence})`
    );
  }

  getState(sessionId: string): VersionedWorldState | null {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    this.applyTemporalDecay(sessionId);
    return state;
  }

  rollback(sessionId: string, targetVersion: number): boolean {
    const state = this.sessions.get(sessionId);
    if (!state || !state.history[targetVersion]) return false;

    const historicalRecord = state.history[targetVersion];
    state.reality = historicalRecord.reality;
    state.version = targetVersion;

    // Restore envelopes
    for (const key of Object.keys(state.belief) as Array<keyof BeliefState>) {
      const histVal = historicalRecord.belief[key];
      const prevEnv = state.belief[key];
      state.belief[key] = {
        value: histVal,
        timestamp: Date.now(),
        version: targetVersion,
        source: 'USER_ASSERTED', // Marked as rollback assertion
        inferenceDepth: prevEnv?.inferenceDepth || 0,
        sourceConfidence: 0.9,
      } as any; // TS mapped-type narrowing limitation — runtime-correct
    }

    this.logger.log(`WSO Rolled back session ${sessionId} to version ${targetVersion}`);
    return true;
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.logger.log(`Cleaned up WSO session context: ${sessionId}`);
  }

  private applyTemporalDecay(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    const now = Date.now();
    let totalConfidenceSum = 0;
    let itemsCount = 0;

    for (const key of Object.keys(state.belief) as Array<keyof BeliefState>) {
      const envelope = state.belief[key];
      if (!envelope) continue;

      const elapsedSeconds = (now - envelope.timestamp) / 1000;
      const decayRate = this.DECAY_RATES[key] || 0.01;
      
      // Exponential decay: C_decayed = C_initial * e^(-lambda * t)
      const decayedConfidence = envelope.sourceConfidence * Math.exp(-decayRate * elapsedSeconds);
      
      totalConfidenceSum += decayedConfidence;
      itemsCount++;
    }

    if (itemsCount > 0) {
      state.stateConfidence = Math.max(0.1, Math.min(1.0, totalConfidenceSum / itemsCount));
    }
  }

  private calculateConsensus(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    // Consensus between DOM Direct values and Vision Inferred values.
    // If they indicate opposing conditions, consensus drops.
    let disagreements = 0;
    let comparisons = 0;

    const envelopes = Object.values(state.belief);
    for (let i = 0; i < envelopes.length; i++) {
      for (let j = i + 1; j < envelopes.length; j++) {
        const envA = envelopes[i];
        const envB = envelopes[j];
        
        // If sources disagree on overlapping states (e.g. DOM says checkout, Vision says no checkout)
        if (envA.source !== envB.source && envA.sourceConfidence > 0.7 && envB.sourceConfidence > 0.7) {
          // Check for logical conflicts in viewport states (checkout vs general, form presence vs no form)
          if (
            (envA.value === true && envB.value === false) ||
            (envA.value === 'session_expired' && envB.value === 'authenticated')
          ) {
            disagreements++;
          }
          comparisons++;
        }
      }
    }

    const disagreementRatio = comparisons > 0 ? disagreements / comparisons : 0;
    state.beliefSourceConsensus = Math.max(0.0, Math.min(1.0, 1.0 - disagreementRatio));
  }

  private createEnvelope<T>(
    value: T,
    source: EpistemicEnvelope<T>['source'],
    confidence: number,
  ): EpistemicEnvelope<T> {
    return {
      value,
      timestamp: Date.now(),
      version: 1,
      source,
      inferenceDepth: 0,
      sourceConfidence: confidence,
    };
  }

  private extractBeliefValues(belief: Record<string, EpistemicEnvelope<any>>): BeliefState {
    const values: any = {};
    for (const key of Object.keys(belief)) {
      values[key] = belief[key].value;
    }
    return values as BeliefState;
  }
}
