import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentStore } from '../agent.store';
import type { AgentPhase, TimelineEntry, LogEntry, ActiveAgent } from '../agent.store';

beforeEach(() => {
  useAgentStore.getState().reset();
});

describe('useAgentStore — initial state', () => {
  it('starts in idle phase', () => {
    expect(useAgentStore.getState().phase).toBe('idle');
  });

  it('starts with null sessionId', () => {
    expect(useAgentStore.getState().sessionId).toBeNull();
  });

  it('starts with empty goal', () => {
    expect(useAgentStore.getState().goal).toBe('');
  });

  it('starts with empty logs', () => {
    expect(useAgentStore.getState().logs).toHaveLength(0);
  });

  it('starts with balanced execution profile', () => {
    expect(useAgentStore.getState().executionProfile).toBe('balanced');
  });
});

describe('useAgentStore — setSessionId', () => {
  it('sets a session id', () => {
    useAgentStore.getState().setSessionId('sess-abc');
    expect(useAgentStore.getState().sessionId).toBe('sess-abc');
  });

  it('clears a session id back to null', () => {
    useAgentStore.getState().setSessionId('sess-abc');
    useAgentStore.getState().setSessionId(null);
    expect(useAgentStore.getState().sessionId).toBeNull();
  });
});

describe('useAgentStore — setPhase', () => {
  const phases: AgentPhase[] = ['parsing', 'planning', 'executing', 'completed', 'failed'];

  phases.forEach((p) => {
    it(`transitions to phase "${p}"`, () => {
      useAgentStore.getState().setPhase(p);
      expect(useAgentStore.getState().phase).toBe(p);
    });
  });
});

describe('useAgentStore — setGoal', () => {
  it('sets the goal string', () => {
    useAgentStore.getState().setGoal('Book a flight to Tokyo');
    expect(useAgentStore.getState().goal).toBe('Book a flight to Tokyo');
  });
});

describe('useAgentStore — setPlan', () => {
  it('sets plan and updates totalSteps', () => {
    const plan = {
      id: 'plan-1',
      goal: 'test',
      steps: [
        { id: 's1', description: 'step 1', status: 'pending' as const },
        { id: 's2', description: 'step 2', status: 'pending' as const },
      ],
    } as any;

    useAgentStore.getState().setPlan(plan);
    expect(useAgentStore.getState().plan).toBe(plan);
    expect(useAgentStore.getState().totalSteps).toBe(2);
  });

  it('clears totalSteps when plan is set to null', () => {
    useAgentStore.getState().setPlan(null);
    expect(useAgentStore.getState().plan).toBeNull();
    expect(useAgentStore.getState().totalSteps).toBe(0);
  });
});

describe('useAgentStore — addLog / clearLogs', () => {
  const makeLog = (id: string): LogEntry => ({
    id,
    timestamp: Date.now(),
    level: 'info',
    source: 'test',
    message: `Log ${id}`,
  });

  it('prepends log entries (newest first)', () => {
    useAgentStore.getState().addLog(makeLog('a'));
    useAgentStore.getState().addLog(makeLog('b'));
    const { logs } = useAgentStore.getState();
    expect(logs[0].id).toBe('b');
    expect(logs[1].id).toBe('a');
  });

  it('caps logs at 500 entries', () => {
    for (let i = 0; i < 510; i++) {
      useAgentStore.getState().addLog(makeLog(`log-${i}`));
    }
    expect(useAgentStore.getState().logs).toHaveLength(500);
  });

  it('clearLogs empties the log array', () => {
    useAgentStore.getState().addLog(makeLog('x'));
    useAgentStore.getState().clearLogs();
    expect(useAgentStore.getState().logs).toHaveLength(0);
  });
});

describe('useAgentStore — addTimelineEntry', () => {
  const makeEntry = (id: string, timestamp: number): TimelineEntry => ({
    id,
    timestamp,
    type: 'step',
    title: `Entry ${id}`,
    description: '',
    status: 'pending',
  });

  it('adds timeline entries sorted by timestamp', () => {
    useAgentStore.getState().addTimelineEntry(makeEntry('b', 200));
    useAgentStore.getState().addTimelineEntry(makeEntry('a', 100));
    const { timeline } = useAgentStore.getState();
    expect(timeline[0].id).toBe('a');
    expect(timeline[1].id).toBe('b');
  });

  it('updates an existing entry with the same id', () => {
    useAgentStore.getState().addTimelineEntry(makeEntry('x', 100));
    useAgentStore
      .getState()
      .addTimelineEntry({ ...makeEntry('x', 100), status: 'completed' });
    const { timeline } = useAgentStore.getState();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].status).toBe('completed');
  });
});

describe('useAgentStore — updateAgentStatus', () => {
  const agent: ActiveAgent = {
    id: 'agent-1',
    role: 'planner',
    status: 'idle',
  };

  it('updates the status of a specific agent', () => {
    useAgentStore.getState().setActiveAgents([agent]);
    useAgentStore.getState().updateAgentStatus('agent-1', 'working', 'Doing work');
    const updated = useAgentStore.getState().activeAgents.find((a) => a.id === 'agent-1');
    expect(updated?.status).toBe('working');
    expect(updated?.currentTask).toBe('Doing work');
  });

  it('leaves other agents unaffected', () => {
    const other: ActiveAgent = { id: 'agent-2', role: 'research', status: 'idle' };
    useAgentStore.getState().setActiveAgents([agent, other]);
    useAgentStore.getState().updateAgentStatus('agent-1', 'completed');
    const unchanged = useAgentStore.getState().activeAgents.find((a) => a.id === 'agent-2');
    expect(unchanged?.status).toBe('idle');
  });
});

describe('useAgentStore — setExecutionProfile', () => {
  it('can switch to conservative', () => {
    useAgentStore.getState().setExecutionProfile('conservative');
    expect(useAgentStore.getState().executionProfile).toBe('conservative');
  });

  it('can switch to aggressive', () => {
    useAgentStore.getState().setExecutionProfile('aggressive');
    expect(useAgentStore.getState().executionProfile).toBe('aggressive');
  });
});

describe('useAgentStore — addDriftRecord', () => {
  it('stores drift records', () => {
    const record = {
      stepIndex: 1,
      similarity: 0.82,
      isDrifted: false,
      type: 'EXPLORATION' as const,
      phase: 'executing',
      explanation: 'test',
      timestamp: Date.now(),
    };
    useAgentStore.getState().addDriftRecord(record);
    expect(useAgentStore.getState().driftRecords).toHaveLength(1);
    expect(useAgentStore.getState().driftRecords[0].similarity).toBe(0.82);
  });

  it('caps at 50 records', () => {
    for (let i = 0; i < 55; i++) {
      useAgentStore.getState().addDriftRecord({
        stepIndex: i,
        similarity: 0.9,
        isDrifted: false,
        type: 'EXPLORATION',
        phase: 'executing',
        explanation: '',
        timestamp: Date.now(),
      });
    }
    expect(useAgentStore.getState().driftRecords).toHaveLength(50);
  });
});

describe('useAgentStore — setMatchedSkills', () => {
  it('stores matched skill names', () => {
    useAgentStore.getState().setMatchedSkills(['job-apply', 'research']);
    expect(useAgentStore.getState().matchedSkills).toEqual(['job-apply', 'research']);
  });
});

describe('useAgentStore — reset', () => {
  it('resets everything back to initial values', () => {
    useAgentStore.getState().setGoal('Some goal');
    useAgentStore.getState().setPhase('executing');
    useAgentStore.getState().setSessionId('xyz');
    useAgentStore.getState().setMatchedSkills(['skill-1']);

    useAgentStore.getState().reset();

    const state = useAgentStore.getState();
    expect(state.goal).toBe('');
    expect(state.phase).toBe('idle');
    expect(state.sessionId).toBeNull();
    expect(state.matchedSkills).toHaveLength(0);
    expect(state.logs).toHaveLength(0);
    expect(state.timeline).toHaveLength(0);
  });
});
