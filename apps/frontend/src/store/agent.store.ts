'use client';

import { create } from 'zustand';
import type {
  ExecutionSession,
  AgentPlan,
  PlannedStep,
  ApprovalRequest,
  ScreenshotFrame,
  ExecutionEvent,
  AgentMemory,
  CognitiveOutcome,
  BrowserState,
  ExecutionState,
} from '@/types/agent';

export type AgentPhase =
  | 'idle'
  | 'parsing'
  | 'planning'
  | 'executing'
  | 'paused'
  | 'waiting_clarification'
  | 'waiting_clarification'
  | 'waiting_approval'
  | 'waiting_otp'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ActiveAgent {
  id: string;
  role: 'planner' | 'research' | 'browser' | 'verification' | 'approval' | 'reporting';
  status: 'idle' | 'working' | 'completed' | 'failed';
  currentTask?: string;
}

export interface TimelineEntry {
  id: string;
  timestamp: number;
  type: 'step' | 'approval' | 'screenshot' | 'event' | 'agent';
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_approval' | 'waiting_otp';
  metadata?: Record<string, any>;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error' | 'success';
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

/** Structured output emitted by the Python AI skills (jobs, products, etc.). */
export interface AgentResult {
  id: string;
  timestamp: number;
  kind: string;
  count: number;
  items: Array<Record<string, any>>;
}

interface AgentStore {
  // Session state
  sessionId: string | null;
  phase: AgentPhase;
  /** Last fatal error surfaced to the user (planning/execution failure). */
  lastError: { message: string; source: string; timestamp: number } | null;
  /** Browser lifecycle state mirrored from the backend state machine. */
  browserState: BrowserState | null;
  /** Derived execution state mirrored from the backend authority (reflective). */
  executionState: ExecutionState | null;
  goal: string;
  parsedGoal: any | null;

  // Plan
  plan: AgentPlan | null;
  currentStepIndex: number;
  totalSteps: number;

  // Live browser
  currentScreenshot: ScreenshotFrame | null;
  screenshotHistory: ScreenshotFrame[];

  // Active agents
  activeAgents: ActiveAgent[];

  // Timeline
  timeline: TimelineEntry[];

  // Logs
  logs: LogEntry[];

  // Structured AI skill results (rendered as cards)
  agentResults: AgentResult[];

  // Approvals
  pendingApproval: ApprovalRequest | null;

  // Events
  events: ExecutionEvent[];

  // Memory
  memories: AgentMemory[];

  // Cognitive OS additions
  verificationResult: any | null;
  recalledStrategies: any[];
  cognitiveState: { reasoning: string; confidence: number; isReplanning: boolean };
  clarificationQuestions: string[] | null;
  clarificationGoal: any | null;

  // ─── COS Runtime Telemetry ──────────────────────────────────────────
  worldState: {
    stateConfidence: number;
    beliefSourceConsensus: number;
    version: number;
    belief: Record<string, { value: any; confidence: number; source: string }>;
  } | null;
  driftRecords: Array<{
    stepIndex: number;
    similarity: number;
    isDrifted: boolean;
    type: 'EXPLORATION' | 'DISTRACTION' | 'CONSTRAINT_INDUCED';
    phase: string;
    explanation: string;
    timestamp: number;
  }>;
  executionProfile: 'conservative' | 'balanced' | 'aggressive';
  driftAbort: { stepIndex: number; reason: string; similarity: number } | null;
  cpnGateEvents: Array<{
    stepIndex: number;
    decision: 'proceed' | 'warn' | 'pause' | 'abort';
    systemConfidence: number;
    profile: string;
    reasoning: string;
    weakestNode: { source: string; confidence: number } | null;
    thresholds: { abort: number; pause: number; warn: number };
    timestamp: number;
  }>;
  cognitiveOutcome: CognitiveOutcome | null;
  executionGraph: any | null;
  routedDomain: string | null;
  matchedSkills: string[];
  userPreferences: {
    preferredJobSites: string[];
    preferredFoodApps: string[];
    preferredShoppingSites: string[];
    preferredTravelSites: string[];
  } | null;

  // Actions
  setSessionId: (id: string | null) => void;
  setPhase: (phase: AgentPhase) => void;
  setError: (error: { message: string; source: string; timestamp: number } | null) => void;
  setGoal: (goal: string) => void;
  setParsedGoal: (goal: any) => void;
  setPlan: (plan: AgentPlan | null) => void;
  setCurrentStep: (index: number) => void;
  updateScreenshot: (frame: ScreenshotFrame) => void;
  addTimelineEntry: (entry: TimelineEntry) => void;
  setTimeline: (entries: TimelineEntry[]) => void;
  addLog: (entry: LogEntry) => void;
  clearLogs: () => void;
  addAgentResult: (result: AgentResult) => void;
  setPendingApproval: (approval: ApprovalRequest | null) => void;
  setBrowserState: (state: BrowserState | null) => void;
  setExecutionState: (state: ExecutionState | null) => void;
  addEvent: (event: ExecutionEvent) => void;
  setActiveAgents: (agents: ActiveAgent[]) => void;
  updateAgentStatus: (agentId: string, status: ActiveAgent['status'], task?: string) => void;
  setMemories: (memories: AgentMemory[]) => void;

  // Cognitive OS actions
  setVerificationResult: (res: any | null) => void;
  setRecalledStrategies: (strategies: any[]) => void;
  setCognitiveState: (state: Partial<{ reasoning: string; confidence: number; isReplanning: boolean }>) => void;
  setClarificationQuestions: (questions: string[] | null) => void;
  setClarificationGoal: (goal: any | null) => void;

  // ─── COS Runtime Telemetry Actions ────────────────────────────────
  setWorldState: (ws: AgentStore['worldState']) => void;
  addDriftRecord: (record: AgentStore['driftRecords'][0]) => void;
  setExecutionProfile: (profile: 'conservative' | 'balanced' | 'aggressive') => void;
  setDriftAbort: (abort: AgentStore['driftAbort']) => void;
  addCpnGateEvent: (event: AgentStore['cpnGateEvents'][0]) => void;
  setCognitiveOutcome: (outcome: CognitiveOutcome | null) => void;
  setExecutionGraph: (graph: any | null) => void;
  setRoutedDomain: (domain: string | null) => void;
  setMatchedSkills: (skills: string[]) => void;
  setUserPreferences: (prefs: AgentStore['userPreferences']) => void;

  reset: () => void;
}

const initialState = {
  sessionId: null as string | null,
  phase: 'idle' as AgentPhase,
  lastError: null as { message: string; source: string; timestamp: number } | null,
  goal: '',
  parsedGoal: null,
  plan: null as AgentPlan | null,
  currentStepIndex: 0,
  totalSteps: 0,
  currentScreenshot: null as ScreenshotFrame | null,
  screenshotHistory: [] as ScreenshotFrame[],
  activeAgents: [] as ActiveAgent[],
  timeline: [] as TimelineEntry[],
  logs: [] as LogEntry[],
  agentResults: [] as AgentResult[],
  pendingApproval: null as ApprovalRequest | null,
  browserState: null as BrowserState | null,
  executionState: null as ExecutionState | null,
  events: [] as ExecutionEvent[],
  memories: [] as AgentMemory[],
  verificationResult: null as any | null,
  recalledStrategies: [] as any[],
  cognitiveState: { reasoning: '', confidence: 1.0, isReplanning: false },
  clarificationQuestions: null as string[] | null,
  clarificationGoal: null as any | null,
  // ─── COS Runtime Telemetry ─────────────────────────────────────────
  worldState: null as AgentStore['worldState'],
  driftRecords: [] as AgentStore['driftRecords'],
  executionProfile: 'balanced' as 'conservative' | 'balanced' | 'aggressive',
  driftAbort: null as AgentStore['driftAbort'],
  cpnGateEvents: [] as AgentStore['cpnGateEvents'],
  cognitiveOutcome: null as CognitiveOutcome | null,
  executionGraph: null as any | null,
  routedDomain: null as string | null,
  matchedSkills: [] as string[],
  userPreferences: null as AgentStore['userPreferences'],
};

export const useAgentStore = create<AgentStore>((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setPhase: (phase) => set({ phase }),
  setError: (lastError) => set({ lastError }),
  setGoal: (goal) => set({ goal }),
  setParsedGoal: (parsedGoal) => set({ parsedGoal }),
  setPlan: (plan) => set({ plan, totalSteps: plan?.steps.length || 0 }),
  setCurrentStep: (index) => set({ currentStepIndex: index }),
  updateScreenshot: (frame) =>
    set((state) => ({
      currentScreenshot: frame,
      screenshotHistory: [...state.screenshotHistory.slice(-49), frame],
    })),
  addTimelineEntry: (entry) =>
    set((state) => ({
      timeline: [...state.timeline.filter((t) => t.id !== entry.id), entry].sort(
        (a, b) => a.timestamp - b.timestamp,
      ),
    })),
  setTimeline: (timeline) => set({ timeline }),
  addLog: (entry) =>
    set((state) => ({
      logs: [entry, ...state.logs].slice(0, 500),
    })),
  clearLogs: () => set({ logs: [] }),
  addAgentResult: (result) =>
    set((state) => ({
      agentResults: [result, ...state.agentResults].slice(0, 50),
    })),
  setPendingApproval: (approval) => set({ pendingApproval: approval }),
  setBrowserState: (state) => set({ browserState: state }),
  setExecutionState: (state) => set({ executionState: state }),
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 200),
    })),
  setActiveAgents: (agents) => set({ activeAgents: agents }),
  updateAgentStatus: (agentId, status, task) =>
    set((state) => ({
      activeAgents: state.activeAgents.map((a) =>
        a.id === agentId ? { ...a, status, currentTask: task || a.currentTask } : a,
      ),
    })),
  setMemories: (memories) => set({ memories }),
  
  setVerificationResult: (verificationResult) => set({ verificationResult }),
  setRecalledStrategies: (recalledStrategies) => set({ recalledStrategies }),
  setCognitiveState: (cs) =>
    set((state) => ({
      cognitiveState: { ...state.cognitiveState, ...cs },
    })),
  setClarificationQuestions: (clarificationQuestions) => set({ clarificationQuestions }),
  setClarificationGoal: (clarificationGoal) => set({ clarificationGoal }),

  // ─── COS Runtime Telemetry ────────────────────────────────────────
  setWorldState: (worldState) => set({ worldState }),
  addDriftRecord: (record) =>
    set((state) => ({
      driftRecords: [...state.driftRecords.slice(-49), record],
    })),
  setExecutionProfile: (executionProfile) => set({ executionProfile }),
  setDriftAbort: (driftAbort) => set({ driftAbort }),
  addCpnGateEvent: (event) =>
    set((state) => ({
      cpnGateEvents: [...state.cpnGateEvents.slice(-49), event],
    })),
  setCognitiveOutcome: (cognitiveOutcome) => set({ cognitiveOutcome }),
  setExecutionGraph: (executionGraph) => set({ executionGraph }),
  setRoutedDomain: (routedDomain) => set({ routedDomain }),
  setMatchedSkills: (matchedSkills) => set({ matchedSkills }),
  setUserPreferences: (userPreferences) => set({ userPreferences }),

  reset: () => set(initialState),
}));
