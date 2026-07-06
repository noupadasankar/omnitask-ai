import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ExecutionSessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentGateway } from '../../websocket/agent.gateway';
import { ParsedGoal } from '../goal-understanding.service';

/**
 * Browser lifecycle — the SINGLE SOURCE OF TRUTH for whether a real Chromium is
 * live. Owned exclusively by the browser runtime (inline BrowserAgent/Streamer,
 * or the Python worker via the relay). The orchestrator never sets RUNNING.
 *
 *   IDLE         → no browser; planning / awaiting the gate
 *   INITIALIZING → runtime is launching Chromium
 *   READY        → Chromium up, observer attached, automation not started
 *   RUNNING      → automation live (confirmed by a real frame / worker signal)
 *   PAUSED       → user paused; browser alive, stream stopped
 *   STOPPED      → finished or cancelled; browser closed
 *   ERROR        → fatal failure
 */
export type BrowserState =
  | 'IDLE'
  | 'INITIALIZING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'ERROR';

/**
 * Gate lifecycle — owned exclusively by the orchestrator + AutomationGate.
 *   PLANNING         → building the plan
 *   PLAN_READY       → plan built, policy-checked, at the gate (NO browser yet)
 *   WAITING_APPROVAL → held for explicit user launch approval
 *   CLEARED          → gate passed; runtime may launch the browser
 */
export type GateState = 'PLANNING' | 'PLAN_READY' | 'WAITING_APPROVAL' | 'CLEARED';

/**
 * Execution state is DERIVED — never set directly. There is intentionally no
 * setter for RUNNING: `executionState === 'RUNNING'` iff `browserState === 'RUNNING'`.
 */
export type ExecutionState =
  | 'IDLE'
  | 'PLANNING'
  | 'PLAN_READY'
  | 'WAITING_APPROVAL'
  | 'BROWSER_INITIALIZING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ERROR';

/** Allowed forward browser transitions. Anything not listed is rejected. */
const ALLOWED_TRANSITIONS: Record<BrowserState, BrowserState[]> = {
  IDLE: ['INITIALIZING', 'READY', 'STOPPED', 'ERROR'],
  INITIALIZING: ['READY', 'RUNNING', 'STOPPED', 'ERROR'],
  READY: ['RUNNING', 'PAUSED', 'STOPPED', 'ERROR'],
  RUNNING: ['PAUSED', 'STOPPED', 'ERROR'],
  PAUSED: ['RUNNING', 'STOPPED', 'ERROR'],
  STOPPED: [],
  ERROR: [],
};

export interface ActiveSessionState {
  sessionId: string;
  aborting: boolean;
  /** Browser lifecycle — owned by the runtime/worker. */
  browserState: BrowserState;
  /** Gate lifecycle — owned by the orchestrator/gate. */
  gateState: GateState;
  parsedGoal?: ParsedGoal;
  errorHistory: string[];
  stepResults: Array<{ success: boolean; error?: string; data?: any }>;
  profile: 'conservative' | 'balanced' | 'aggressive';
  matchedPluginIds?: string[];
  routedDomain?: string;
  // Internal change-detection so we don't spam ws/DB on every frame.
  lastBrowserEmit?: BrowserState;
  lastExecEmit?: ExecutionState;
}

/**
 * The single authority for session state. Two owners feed it:
 *   - the orchestrator sets `gateState`
 *   - the browser runtime sets `browserState`
 * It derives the public `executionState`, broadcasts `browser:state` +
 * `execution:state`, and persists the DB status. Nothing else may emit those.
 */
@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);
  private sessions = new Map<string, ActiveSessionState>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AgentGateway))
    private readonly gateway: AgentGateway,
  ) {}

  create(sessionId: string, profile: ActiveSessionState['profile'], parsedGoal?: ParsedGoal): ActiveSessionState {
    const state: ActiveSessionState = {
      sessionId,
      aborting: false,
      browserState: 'IDLE',
      gateState: 'PLANNING',
      parsedGoal,
      errorHistory: [],
      stepResults: [],
      profile,
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  get(sessionId: string): ActiveSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  isAborting(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.aborting ?? false;
  }

  setAborting(sessionId: string, aborting: boolean): void {
    const s = this.sessions.get(sessionId);
    if (s) s.aborting = aborting;
  }

  // ─── State machine ──────────────────────────────────────────────────────

  getBrowserState(sessionId: string): BrowserState | undefined {
    return this.sessions.get(sessionId)?.browserState;
  }

  getGateState(sessionId: string): GateState | undefined {
    return this.sessions.get(sessionId)?.gateState;
  }

  /** True only when a live browser exists and may be driven. */
  canExecute(sessionId: string): boolean {
    const s = this.sessions.get(sessionId)?.browserState;
    return s === 'READY' || s === 'RUNNING';
  }

  /**
   * Gate-state setter — the ONLY thing the orchestrator/gate may write. It can
   * never produce a RUNNING execution state (that requires browserState).
   */
  setGateState(sessionId: string, to: GateState): void {
    const s = this.sessions.get(sessionId);
    if (!s || s.gateState === to) return;
    this.logger.log(`[GateState] ${sessionId}: [${s.gateState}] ──> [${to}]`);
    s.gateState = to;
    this.recompute(s);
  }

  /**
   * Browser-state transition — the ONLY thing the runtime/worker may write.
   * Returns true if the (legal) transition was applied. Illegal transitions are
   * logged and rejected, never thrown.
   */
  transitionBrowserState(sessionId: string, to: BrowserState): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) {
      this.logger.warn(`[StateMachine] No session ${sessionId} for → ${to}`);
      return false;
    }
    const from = s.browserState;
    if (from === to) return true;
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      this.logger.warn(
        `[StateMachine] Illegal transition for ${sessionId}: [${from}] ⤫→ [${to}]`,
      );
      return false;
    }
    s.browserState = to;
    this.logger.log(`[StateMachine] ${sessionId}: [${from}] ──> [${to}]`);
    this.recompute(s);
    return true;
  }

  /**
   * Pure derivation. INVARIANT: executionState === 'RUNNING' iff
   * browserState === 'RUNNING'. The gate takes precedence only for pre-launch.
   */
  deriveExecutionState(browserState: BrowserState, gateState: GateState): ExecutionState {
    if (gateState === 'WAITING_APPROVAL') return 'WAITING_APPROVAL';
    switch (browserState) {
      case 'RUNNING': return 'RUNNING';
      case 'PAUSED': return 'PAUSED';
      case 'READY': return 'READY';
      case 'INITIALIZING': return 'BROWSER_INITIALIZING';
      case 'STOPPED': return 'COMPLETED';
      case 'ERROR': return 'ERROR';
      case 'IDLE':
      default:
        if (gateState === 'PLAN_READY' || gateState === 'CLEARED') return 'PLAN_READY';
        return 'PLANNING';
    }
  }

  /**
   * Map a derived execution state to the persisted DB enum. Returns null for
   * terminal states — COMPLETED/FAILED/CANCELLED are written (with verification
   * metadata) by the orchestrator/relay, not here.
   */
  private mapToDbStatus(state: ExecutionState): ExecutionSessionStatus | null {
    switch (state) {
      case 'WAITING_APPROVAL': return ExecutionSessionStatus.WAITING_APPROVAL;
      case 'RUNNING': return ExecutionSessionStatus.RUNNING;
      case 'PAUSED': return ExecutionSessionStatus.PAUSED;
      case 'PLANNING':
      case 'PLAN_READY':
      case 'READY':
      case 'BROWSER_INITIALIZING':
        return ExecutionSessionStatus.PLANNING;
      // COMPLETED / ERROR / IDLE → owned by terminal writers (or no-op).
      default:
        return null;
    }
  }

  /** Single writer: broadcast state + persist derived status, change-detected. */
  private recompute(s: ActiveSessionState): void {
    const derived = this.deriveExecutionState(s.browserState, s.gateState);

    // Structural guardrail — RUNNING must never be derived without a live browser.
    if (derived === 'RUNNING' && s.browserState !== 'RUNNING') {
      this.logger.error(
        `[StateAuthority] INVARIANT VIOLATION: executionState=RUNNING but browserState=${s.browserState} (session ${s.sessionId})`,
      );
    }

    if (s.lastBrowserEmit !== s.browserState) {
      s.lastBrowserEmit = s.browserState;
      this.gateway.emitToSession(s.sessionId, 'browser:state', {
        sessionId: s.sessionId,
        state: s.browserState,
      });
    }

    if (s.lastExecEmit !== derived) {
      s.lastExecEmit = derived;
      this.gateway.emitToSession(s.sessionId, 'execution:state', {
        sessionId: s.sessionId,
        state: derived,
        browserState: s.browserState,
        gateState: s.gateState,
      });

      const dbStatus = this.mapToDbStatus(derived);
      if (dbStatus) {
        // Fire-and-forget — never block the state machine on a DB write.
        this.prisma.executionSession
          .update({ where: { id: s.sessionId }, data: { status: dbStatus } })
          .catch((e) =>
            this.logger.warn(`[StateAuthority] persist ${dbStatus} failed: ${e.message}`),
          );
      }
    }
  }

  allSessionIds(): string[] {
    return [...this.sessions.keys()];
  }
}
