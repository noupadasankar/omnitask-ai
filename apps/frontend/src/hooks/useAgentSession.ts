import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/providers/SocketProvider';
import { useAgentStore, AgentPhase } from '@/store/agent.store';
import * as agentApi from '@/services/agent.service';
import type { ScreenshotFrame, ApprovalRequest } from '@/types/agent';
import { wsService } from '@/services/websocket.service';

export function useAgentSession(sessionIdParam?: string | null) {
  const socket = useSocket();
  const store = useAgentStore();
  const sessionIdRef = useRef<string | null>(null);

  // Synchronize sessionId to ref for callbacks
  useEffect(() => {
    sessionIdRef.current = sessionIdParam || store.sessionId;
  }, [sessionIdParam, store.sessionId]);

  // Handle socket event updates
  const handleSocketEvent = useCallback((event: any) => {
    const { type, data, timestamp = Date.now() } = event;
    if (!type) return;

    // Log tracking
    if (type.startsWith('log:')) {
      const level = type.substring(4) as any;
      store.addLog({
        id: `log_${timestamp}_${Math.random()}`,
        timestamp,
        level,
        source: data.source || 'Agent',
        message: data.message || JSON.stringify(data),
      });
      return;
    }

    // Process specific events
    switch (type) {
      case 'session:started':
        store.setPhase('executing');
        break;
      case 'plan:created':
        if (data.plan) {
          store.setPlan(data.plan);
          store.setPhase('executing');
        }
        break;
      case 'plan:replanned':
        if (data.plan) {
          store.setPlan(data.plan);
          store.addLog({
            id: `replan_${timestamp}`,
            timestamp,
            level: 'warn',
            source: 'Planner',
            message: `Execution path failed. Dynamically replanned remaining steps from index ${data.fromStep}.`,
          });
        }
        break;
      case 'step:started':
        store.setCurrentStep(data.stepIndex);
        store.addTimelineEntry({
          id: `step_${data.stepIndex}`,
          timestamp,
          type: 'step',
          title: `Step ${data.stepIndex + 1} Started`,
          description: data.description,
          status: 'running',
        });
        break;
      case 'step:completed':
        store.addTimelineEntry({
          id: `step_${data.stepIndex}`,
          timestamp,
          type: 'step',
          title: `Step ${data.stepIndex + 1} Completed`,
          description: `Finished executing. Validation result: ${data.validation ? 'PASSED' : 'SKIPPED'}.`,
          status: 'completed',
        });
        break;
      case 'step:failed':
        store.addTimelineEntry({
          id: `step_${data.stepIndex}`,
          timestamp,
          type: 'step',
          title: `Step ${data.stepIndex + 1} Failed`,
          description: `Execution error: ${data.error || 'Unknown error'}`,
          status: 'failed',
        });
        break;
      case 'screenshot:frame':
        store.updateScreenshot(data as ScreenshotFrame);
        break;
      case 'approval:requested':
        const approval: ApprovalRequest = {
          id: data.approvalRequestId,
          stepIndex: data.stepIndex,
          riskLevel: data.riskLevel,
          actionDetails: data.actionDetails,
          expiresAt: data.expiresAt,
        };
        store.setPendingApproval(approval);
        store.setPhase('waiting_approval');
        store.addTimelineEntry({
          id: `approval_${data.approvalRequestId}`,
          timestamp,
          type: 'approval',
          title: 'Action Verification Requested',
          description: `Requires approval: ${data.actionDetails?.description || 'Sensitive page action'}`,
          status: 'waiting_approval',
        });
        break;
      case 'approval:responded':
        store.setPendingApproval(null);
        store.setPhase('executing');
        store.addTimelineEntry({
          id: `approval_${data.approvalRequestId}`,
          timestamp,
          type: 'approval',
          title: 'Action Verification Approved',
          description: 'Execution resumed by user.',
          status: 'completed',
        });
        break;
      case 'approval:expired':
        store.setPendingApproval(null);
        store.setPhase('failed');
        break;
      case 'execution:paused':
        store.setPhase('paused');
        break;
      case 'execution:resumed':
        store.setPhase('executing');
        break;
      case 'execution:cancelled':
        store.setPhase('cancelled');
        break;
      case 'execution:completed':
        store.setPhase('completed');
        break;
      case 'execution:failed':
        store.setPhase('failed');
        break;
      case 'agent:thinking':
        store.addLog({
          id: `thinking_${timestamp}`,
          timestamp,
          level: 'info',
          source: 'Coordinator',
          message: data.message || 'Worker reasoning state active...',
        });
        break;
    }
  }, [store]);

  // Connect WebSockets when sessionId is active
  useEffect(() => {
    const sId = sessionIdRef.current;
    if (!sId) return;

    const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || 'user_1' : 'user_1';
    wsService.joinSession(sId, userId);

    const unsubscribeEvent = wsService.on('execution:event', handleSocketEvent);
    const unsubscribeFrame = wsService.on('screenshot:frame', (data: any) => {
      store.updateScreenshot(data as ScreenshotFrame);
    });

    return () => {
      wsService.leaveSession(sId);
      unsubscribeEvent();
      unsubscribeFrame();
    };
  }, [handleSocketEvent, store]);

  // Orchestrations APIs
  const startSession = useCallback(async (payload: agentApi.StartGoalPayload) => {
    store.reset();
    store.setGoal(payload.goal);
    store.setPhase('parsing');

    try {
      const { sessionId, parsedGoal } = await agentApi.startGoalExecution(payload);
      store.setSessionId(sessionId);
      store.setParsedGoal(parsedGoal);
      store.setPhase('planning');
      return sessionId;
    } catch (error: any) {
      store.setPhase('failed');
      store.addLog({
        id: `start_err_${Date.now()}`,
        timestamp: Date.now(),
        level: 'error',
        source: 'Gateway',
        message: `Failed to trigger orchestrations run: ${error.message || error}`,
      });
      throw error;
    }
  }, [store]);

  const sendInterrupt = useCallback(async (command: string) => {
    const sId = sessionIdRef.current;
    if (!sId) return;
    try {
      await agentApi.sendCommand(sId, command);
    } catch (error) {
      console.error('Failed to dispatch command interrupt:', error);
    }
  }, []);

  const pause = useCallback(async () => {
    const sId = sessionIdRef.current;
    if (!sId) return;
    try {
      await agentApi.pauseSession(sId);
      store.setPhase('paused');
    } catch (error) {
      console.error('Failed to pause:', error);
    }
  }, [store]);

  const resume = useCallback(async () => {
    const sId = sessionIdRef.current;
    if (!sId) return;
    try {
      await agentApi.resumeSession(sId);
      store.setPhase('executing');
    } catch (error) {
      console.error('Failed to resume:', error);
    }
  }, [store]);

  const cancel = useCallback(async () => {
    const sId = sessionIdRef.current;
    if (!sId) return;
    try {
      await agentApi.cancelSession(sId);
      store.setPhase('cancelled');
    } catch (error) {
      console.error('Failed to cancel:', error);
    }
  }, [store]);

  const approve = useCallback(async (requestId: string) => {
    try {
      await agentApi.respondToApproval(requestId, 'APPROVED');
      store.setPendingApproval(null);
    } catch (error) {
      console.error('Failed to approve request:', error);
    }
  }, [store]);

  const deny = useCallback(async (requestId: string) => {
    try {
      await agentApi.respondToApproval(requestId, 'DENIED');
      store.setPendingApproval(null);
    } catch (error) {
      console.error('Failed to deny request:', error);
    }
  }, [store]);

  return {
    sessionId: store.sessionId,
    phase: store.phase,
    goal: store.goal,
    parsedGoal: store.parsedGoal,
    plan: store.plan,
    currentStepIndex: store.currentStepIndex,
    totalSteps: store.totalSteps,
    currentScreenshot: store.currentScreenshot,
    screenshotHistory: store.screenshotHistory,
    activeAgents: store.activeAgents,
    timeline: store.timeline,
    logs: store.logs,
    pendingApproval: store.pendingApproval,
    startSession,
    sendInterrupt,
    pause,
    resume,
    cancel,
    approve,
    deny,
  };
}
