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
} from '@/types/agent';

export type AgentPhase =
  | 'idle'
  | 'parsing'
  | 'planning'
  | 'executing'
  | 'paused'
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

interface AgentStore {
  // Session state
  sessionId: string | null;
  phase: AgentPhase;
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

  // Approvals
  pendingApproval: ApprovalRequest | null;

  // Events
  events: ExecutionEvent[];

  // Memory
  memories: AgentMemory[];

  // Actions
  setSessionId: (id: string | null) => void;
  setPhase: (phase: AgentPhase) => void;
  setGoal: (goal: string) => void;
  setParsedGoal: (goal: any) => void;
  setPlan: (plan: AgentPlan | null) => void;
  setCurrentStep: (index: number) => void;
  updateScreenshot: (frame: ScreenshotFrame) => void;
  addTimelineEntry: (entry: TimelineEntry) => void;
  setTimeline: (entries: TimelineEntry[]) => void;
  addLog: (entry: LogEntry) => void;
  clearLogs: () => void;
  setPendingApproval: (approval: ApprovalRequest | null) => void;
  addEvent: (event: ExecutionEvent) => void;
  setActiveAgents: (agents: ActiveAgent[]) => void;
  updateAgentStatus: (agentId: string, status: ActiveAgent['status'], task?: string) => void;
  setMemories: (memories: AgentMemory[]) => void;
  reset: () => void;
}

const initialState = {
  sessionId: null as string | null,
  phase: 'idle' as AgentPhase,
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
  pendingApproval: null as ApprovalRequest | null,
  events: [] as ExecutionEvent[],
  memories: [] as AgentMemory[],
};

export const useAgentStore = create<AgentStore>((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setPhase: (phase) => set({ phase }),
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
  setPendingApproval: (approval) => set({ pendingApproval: approval }),
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
  reset: () => set(initialState),
}));
