import { useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useSocket } from '@/providers/SocketProvider';
import { useAgentStore, AgentPhase } from '@/store/agent.store';
import * as agentApi from '@/services/agent.service';
import type { ScreenshotFrame, ApprovalRequest } from '@/types/agent';
import { wsService } from '@/services/websocket.service';

/** Turn a raw backend/LLM error into a short, human-actionable message. */
function humanizeError(raw?: string): string {
  const msg = (raw || '').toString();
  if (/401|invalid api key|incorrect api key/i.test(msg)) {
    return 'OpenAI rejected the API key (401). Update OPENAI_API_KEY in .env and restart the backend.';
  }
  if (/429|rate limit|quota/i.test(msg)) {
    return 'OpenAI rate limit or quota exceeded. Check your plan/billing and try again.';
  }
  if (/insufficient_quota|billing/i.test(msg)) {
    return 'OpenAI billing/quota issue. Add credit to your OpenAI account.';
  }
  if (/ECONNREFUSED|network|timeout|fetch failed/i.test(msg)) {
    return 'Could not reach the AI provider. Check your network/connection.';
  }
  return msg ? `Execution failed: ${msg}` : 'Execution failed for an unknown reason.';
}

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

    // Read the store via getState() so this callback stays referentially
    // stable (deps: []). Zustand action refs are stable, and reading fresh
    // state per event avoids re-creating the WS subscription effect on every
    // store mutation (which would thrash the session room and drop frames).
    const store = useAgentStore.getState();

    // Promote to 'executing' as soon as live signals arrive, so the viewport
    // never gets stuck behind a missed 'plan:created'/'session:started' event
    // (e.g. join-race on launch, or a page refresh mid-run).
    const promoteToExecuting = () => {
      const p = useAgentStore.getState().phase;
      if (p === 'idle' || p === 'parsing' || p === 'planning') {
        store.setPhase('executing');
      }
    };

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

      if (data.source === 'StrategyMemory' && data.strategies) {
        store.setRecalledStrategies(data.strategies);
      }
      return;
    }

    // Process specific events
    switch (type) {
      case 'session:started':
        store.setPhase('executing');
        store.setCognitiveOutcome(null);
        if (data.profile) store.setExecutionProfile(data.profile);
        break;
      case 'session:worker:started':
        // Worker picked up the job, but the browser is NOT live yet. The
        // truthful phase comes from execution:state / browser:state, never here.
        break;
      case 'plan:created':
        if (data.plan) {
          store.setPlan(data.plan);
          // Plan is READY — not executing yet (no browser). The authority moves
          // us to executing via execution:state once a browser is truly RUNNING.
          store.setPhase('planning');
        }
        break;
      case 'plan:replanned':
        if (data.plan) {
          store.setPlan(data.plan);
          store.setCognitiveState({ isReplanning: true });
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
        promoteToExecuting();
        store.setCurrentStep(data.stepIndex);
        store.setCognitiveState({ reasoning: data.description || '', isReplanning: false });
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
        if (typeof data.confidence === 'number') {
          store.setCognitiveState({ confidence: data.confidence });
        }
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
        promoteToExecuting();
        store.updateScreenshot(data as ScreenshotFrame);
        break;
      case 'agent:result':
        if (Array.isArray(data.items) && data.items.length > 0) {
          store.addAgentResult({
            id: `result_${timestamp}_${Math.random()}`,
            timestamp,
            kind: data.kind || 'result',
            count: data.count ?? data.items.length,
            items: data.items,
          });
        }
        break;
      case 'browser:click':
      case 'browser:type':
      case 'browser:cursor':
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          const frame = useAgentStore.getState().currentScreenshot;
          if (frame?.base64) {
            store.updateScreenshot({
              ...frame,
              cursorPosition: { x: data.x, y: data.y },
              highlightedElement: data.highlightedElement,
              timestamp: data.timestamp || Date.now(),
            });
          }
        }
        store.addLog({
          id: `browser_${timestamp}`,
          timestamp,
          level: 'info',
          source: 'BrowserAgent',
          message: data.label || `${type}: ${data.target || data.url || ''}`,
        });
        break;
      case 'browser:scroll':
        store.addLog({
          id: `scroll_${timestamp}`,
          timestamp,
          level: 'info',
          source: 'BrowserAgent',
          message: `Scrolled ${data.amount}px ${data.direction || ''}`,
        });
        break;
      case 'browser:navigation':
        store.addLog({
          id: `nav_${timestamp}`,
          timestamp,
          level: 'info',
          source: 'BrowserTelemetry',
          message: data.label || `Navigated to ${data.url || 'page'}`,
        });
        break;
      case 'browser:network':
        store.addLog({
          id: `net_${timestamp}`,
          timestamp,
          level: data.status && data.status >= 400 ? 'warn' : 'info',
          source: 'BrowserTelemetry',
          message: data.label || `${data.direction}: ${data.method || ''} ${data.url || ''}`,
        });
        break;
      case 'browser:console':
        store.addLog({
          id: `console_${timestamp}`,
          timestamp,
          level: data.type === 'error' ? 'error' : 'debug',
          source: 'BrowserTelemetry',
          message: data.text || data.label || 'Console output',
        });
        break;
      case 'browser:dom-change':
        store.addLog({
          id: `dom_${timestamp}`,
          timestamp,
          level: 'debug',
          source: 'BrowserTelemetry',
          message: data.changeSummary || data.label || 'DOM changed',
        });
        break;
      case 'browser:error':
        store.addLog({
          id: `err_${timestamp}`,
          timestamp,
          level: 'error',
          source: 'BrowserTelemetry',
          message: data.message || data.label || 'Browser error',
        });
        break;
      case 'memory:preferences_applied':
        if (data.preferences) store.setUserPreferences(data.preferences);
        store.addLog({
          id: `pref_${timestamp}`,
          timestamp,
          level: 'success',
          source: 'PreferenceMemory',
          message: data.message || `Preferences applied: ${(data.activeForDomain || []).join(', ')}`,
        });
        break;
      case 'memory:preferences_updated':
        if (data.preferences) store.setUserPreferences(data.preferences);
        store.addLog({
          id: `preflearn_${timestamp}`,
          timestamp,
          level: 'success',
          source: 'PreferenceMemory',
          message: `Learned from successful run: ${(data.learnedFrom || []).join(', ')}`,
        });
        break;
      case 'vision:analysis_started':
        store.addLog({
          id: `vision_start_${timestamp}`,
          timestamp,
          level: 'info',
          source: 'VisionAgent',
          message: `Analyzing page DOM for step ${data.stepIndex + 1}…`,
        });
        break;
      case 'vision:analysis_complete':
        if (data.visionAnalysis) {
          store.addLog({
            id: `vision_done_${timestamp}`,
            timestamp,
            level: 'info',
            source: 'VisionAgent',
            message: `Page state: ${data.visionAnalysis.pageState} | ${data.visionAnalysis.buttonCount} buttons detected`,
          });
        }
        break;
      case 'healing:recovery_plan':
        store.addLog({
          id: `heal_plan_${timestamp}`,
          timestamp,
          level: 'success',
          source: 'SelfHealing',
          message: `[${data.recoveryType}] ${data.explanation}${data.alternativeSelector ? ` → ${data.alternativeSelector}` : ''} (${Math.round((data.confidence || 0) * 100)}%)`,
        });
        break;
      case 'healing:retry_success':
        store.addLog({
          id: `heal_ok_${timestamp}`,
          timestamp,
          level: 'success',
          source: 'SelfHealing',
          message: `Step ${(data.stepIndex ?? 0) + 1} recovered via ${data.recoveryType}: ${data.explanation}`,
        });
        break;
      case 'healing:failed':
        store.addLog({
          id: `heal_fail_${timestamp}`,
          timestamp,
          level: 'warn',
          source: 'SelfHealing',
          message: `Recovery failed: ${data.explanation}`,
        });
        break;
      case 'execution:graph':
        if (data.graph) store.setExecutionGraph(data.graph);
        if (data.domain) store.setRoutedDomain(data.domain);
        if (data.matchedSkills) store.setMatchedSkills(data.matchedSkills);
        break;
      case 'agent:domain_routed':
        if (data.domain) store.setRoutedDomain(data.domain);
        store.addLog({
          id: `route_${timestamp}`,
          timestamp,
          level: 'info',
          source: 'AgentRouter',
          message: `Routed to ${data.domain} domain agent (task: ${data.taskType})`,
        });
        break;
      case 'agent:registry_routed':
        if (data.domain) store.setRoutedDomain(data.domain);
        if (data.plugins) store.setMatchedSkills(data.plugins);
        store.addLog({
          id: `registry_${timestamp}`,
          timestamp,
          level: 'info',
          source: 'AgentRegistry',
          message: data.parallel
            ? `${data.agentId} → parallel plugins: ${(data.plugins || []).join(', ')}`
            : `${data.agentId} → ${(data.plugins || []).join(', ') || 'planner'}`,
        });
        break;
      case 'approval:requested':
        const approval: ApprovalRequest = {
          id: data.approvalRequestId,
          stepIndex: data.stepIndex,
          gate: data.gate || data.actionDetails?.gate || data.stepIndex === -1,
          targetDomains: data.targetDomains || data.actionDetails?.targetDomains,
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
          title: approval.gate ? 'Browser Launch Authorization' : 'Action Verification Requested',
          description: approval.gate
            ? `Approve to open the browser and begin: ${data.actionDetails?.description || data.reason || 'automation'}`
            : `Requires approval: ${data.actionDetails?.description || 'Sensitive page action'}`,
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
      case 'automation:gate':
        // The decision boundary fired. Log it so the user sees WHY the browser
        // is (or isn't) about to open. The approval prompt, if any, arrives via
        // 'approval:requested'.
        store.addLog({
          id: `gate_${timestamp}`,
          timestamp,
          level: data.proceed ? (data.requiresApproval ? 'warn' : 'info') : 'error',
          source: 'AutomationGate',
          message: data.proceed
            ? data.requiresApproval
              ? `Automation gate: launch awaiting approval — ${data.reason}`
              : `Automation gate: cleared — ${data.reason}`
            : `Automation gate: BLOCKED — ${data.reason}`,
        });
        break;
      case 'browser:state':
        // Mirror the backend browser lifecycle state machine (authoritative).
        store.setBrowserState?.(data.state);
        break;
      case 'execution:state':
        // Derived execution state from the backend authority. Purely reflective —
        // the frontend never computes RUNNING itself.
        store.setExecutionState?.(data.state);
        switch (data.state) {
          case 'RUNNING':
            store.setPhase('executing');
            break;
          case 'PAUSED':
            store.setPhase('paused');
            break;
          case 'WAITING_APPROVAL':
            store.setPhase('waiting_approval');
            break;
          case 'PLAN_READY':
          case 'BROWSER_INITIALIZING':
          case 'READY':
            // Pre-running: plan ready / browser launching. Not executing yet.
            store.setPhase('planning');
            break;
          // COMPLETED / ERROR are handled by execution:completed / execution:failed.
        }
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
        if (data.cognitiveOutcome) {
          store.setCognitiveOutcome(data.cognitiveOutcome);
        }
        break;
      case 'execution:failed': {
        store.setPhase('failed');
        const friendly = humanizeError(data.message || data.reason);
        store.setError({ message: friendly, source: data.reason || 'execution', timestamp });
        store.addLog({
          id: `fail_${timestamp}`,
          timestamp,
          level: 'error',
          source: 'ExecutionEngine',
          message: friendly,
        });
        toast.error(friendly, { duration: 8000 });
        if (data.cognitiveOutcome) {
          store.setCognitiveOutcome(data.cognitiveOutcome);
        }
        break;
      }
      case 'execution:verified':
        store.setVerificationResult(data);
        break;
      case 'supervisor:question':
        store.setClarificationQuestions([data.question]);
        store.setPhase('waiting_clarification');
        break;
      case 'clarification:required':
        store.setClarificationQuestions(data.clarifyingQuestions || []);
        store.setClarificationGoal(data.parsedGoal || store.parsedGoal);
        store.setParsedGoal(data.parsedGoal || store.parsedGoal);
        store.setPhase('waiting_clarification');
        break;
      case 'clarification:resolved':
        store.setClarificationQuestions(null);
        store.setClarificationGoal(null);
        if (data.refinedGoal) store.setParsedGoal(data.refinedGoal);
        store.setPhase('planning');
        store.addLog({
          id: `clarify_${timestamp}`,
          timestamp,
          level: 'success',
          source: 'GoalUnderstanding',
          message: data.message || 'Goal clarified. Resuming planning...',
        });
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

      // ─── COS Runtime Events ──────────────────────────────────────────────
      case 'cos:world_state':
      case 'cos:world_state_final':
        // Live World State Object telemetry from the COS runtime
        store.setWorldState({
          stateConfidence: data.stateConfidence,
          beliefSourceConsensus: data.beliefSourceConsensus,
          version: data.version,
          belief: data.belief || {},
        });
        // Also pipe confidence as cognitive state for legacy components
        if (typeof data.stateConfidence === 'number') {
          store.setCognitiveState({ confidence: data.stateConfidence });
        }
        break;

      case 'cos:drift':
        // Trajectory drift sample — recorded for the HUD sparkline
        store.addDriftRecord({
          stepIndex: data.stepIndex,
          similarity: data.similarity,
          isDrifted: data.isDrifted,
          type: data.type,
          phase: data.phase,
          explanation: data.explanation,
          timestamp,
        });
        break;

      case 'cos:drift_abort':
        // Hard abort from DISTRACTION drift — surface to user immediately
        store.setDriftAbort({
          stepIndex: data.stepIndex,
          reason: data.reason,
          similarity: data.similarity,
        });
        store.setPhase('failed');
        store.addTimelineEntry({
          id: `drift_abort_${timestamp}`,
          timestamp,
          type: 'event',
          title: '🛑 Cognitive Drift Abort',
          description: data.reason,
          status: 'failed',
          metadata: { similarity: data.similarity, stepIndex: data.stepIndex },
        });
        break;

      case 'cos:cpn_gate':
        // Structured CPN gate evaluation — consumed directly by CognitiveDiagnosticsPanel
        store.addCpnGateEvent({
          stepIndex: data.stepIndex,
          decision: data.decision,
          systemConfidence: data.systemConfidence,
          profile: data.profile,
          reasoning: data.reasoning,
          weakestNode: data.weakestNode ?? null,
          thresholds: data.thresholds ?? { abort: 0.2, pause: 0.4, warn: 0.6 },
          timestamp,
        });
        break;
    }
  }, []);

  // Connect WebSockets when sessionId is active
  useEffect(() => {
    const sId = store.sessionId;
    if (!sId) return;

    const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || 'user_1' : 'user_1';
    wsService.joinSession(sId, userId);

    const eventTypes = [
      'execution:event',
      'session:started',
      'plan:created',
      'plan:replanned',
      'step:started',
      'step:completed',
      'step:failed',
      'step:blocked',
      'step:denied',
      'step:validation_failed',
      'approval:requested',
      'approval:responded',
      'approval:expired',
      'automation:gate',
      'browser:initialized',
      'browser:state',
      'execution:state',
      'execution:paused',
      'execution:resumed',
      'execution:cancelled',
      'execution:completed',
      'execution:failed',
      'execution:verified',
      'supervisor:question',
      'clarification:required',
      'clarification:resolved',
      'session:worker:started',
      'browser:click',
      'browser:type',
      'browser:cursor',
      'browser:scroll',
      'browser:navigation',
      'browser:network',
      'browser:console',
      'browser:dom-change',
      'browser:error',
      'memory:preferences_applied',
      'memory:preferences_updated',
      'vision:analysis_started',
      'vision:analysis_complete',
      'healing:recovery_plan',
      'healing:retry_success',
      'healing:failed',
      'execution:graph',
      'agent:domain_routed',
      'agent:registry_routed',
      'agent:result',
      // ─── COS Runtime Events
      'cos:world_state',
      'cos:world_state_final',
      'cos:drift',
      'cos:drift_abort',
      'cos:cpn_gate',
    ];

    const unsubscribers = eventTypes.map((eventType) => {
      return wsService.on(eventType, (eventData: any) => {
        if (eventType === 'execution:event') {
          handleSocketEvent(eventData);
        } else {
          handleSocketEvent({ type: eventType, data: eventData });
        }
      });
    });

    const unsubscribeFrame = wsService.on('screenshot:frame', (data: any) => {
      const s = useAgentStore.getState();
      if (s.phase === 'idle' || s.phase === 'parsing' || s.phase === 'planning') {
        s.setPhase('executing');
      }
      s.updateScreenshot(data as ScreenshotFrame);
    });

    return () => {
      wsService.leaveSession(sId);
      unsubscribers.forEach((unsub) => unsub());
      unsubscribeFrame();
    };
    // Re-run ONLY when the session changes or the socket (re)connects — never on
    // every store mutation. Depending on socket.isConnected ensures we (re)join
    // the session room and (re)subscribe once the socket is actually live, so the
    // live browser frames are never missed due to a join-before-connect race.
  }, [store.sessionId, socket.isConnected, handleSocketEvent]);

  const respondToClarification = useCallback(async (answers: string) => {
    const sId = sessionIdRef.current;
    if (!sId) return;
    try {
      await wsService.sendClarificationResponse(sId, answers);
      store.setPhase('planning');
    } catch (error) {
      console.error('Failed to send clarification response:', error);
    }
  }, [store]);

  // Orchestrations APIs
  const startSession = useCallback(async (payload: agentApi.StartGoalPayload) => {
    store.reset();
    store.setGoal(payload.goal);
    store.setPhase('parsing');
    // Pre-set profile immediately so HUD reflects the selection before WS event
    if (payload.profile) store.setExecutionProfile(payload.profile);

    try {
      const { sessionId, parsedGoal } = await agentApi.startGoalExecution(payload);
      store.setParsedGoal(parsedGoal);

      // Pre-session ambiguity gate — ask before creating runtime session
      if (!sessionId && parsedGoal?.ambiguityScore > 0.6) {
        store.setClarificationQuestions(parsedGoal.clarifyingQuestions || []);
        store.setClarificationGoal(parsedGoal);
        store.setPhase('waiting_clarification');
        return null;
      }

      if (!sessionId) {
        throw new Error('No session ID returned from orchestrator');
      }

      store.setSessionId(sessionId);
      store.setPhase('planning');
      return sessionId;
    } catch (error: any) {
      store.setPhase('failed');
      const raw = error?.response?.data?.message || error?.message || String(error);
      const friendly = humanizeError(raw);
      store.setError({ message: friendly, source: 'gateway', timestamp: Date.now() });
      store.addLog({
        id: `start_err_${Date.now()}`,
        timestamp: Date.now(),
        level: 'error',
        source: 'Gateway',
        message: friendly,
      });
      toast.error(friendly, { duration: 8000 });
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
    lastError: store.lastError,
    goal: store.goal,
    parsedGoal: store.parsedGoal,
    plan: store.plan,
    currentStepIndex: store.currentStepIndex,
    totalSteps: store.totalSteps,
    currentScreenshot: store.currentScreenshot,
    screenshotHistory: store.screenshotHistory,
    browserState: store.browserState,
    executionState: store.executionState,
    activeAgents: store.activeAgents,
    timeline: store.timeline,
    logs: store.logs,
    agentResults: store.agentResults,
    pendingApproval: store.pendingApproval,
    clarificationQuestions: store.clarificationQuestions,
    clarificationGoal: store.clarificationGoal,
    cognitiveState: store.cognitiveState,
    executionGraph: store.executionGraph,
    routedDomain: store.routedDomain,
    matchedSkills: store.matchedSkills,
    userPreferences: store.userPreferences,
    verificationResult: store.verificationResult,
    startSession,
    sendInterrupt,
    pause,
    resume,
    cancel,
    approve,
    deny,
    respondToClarification,
  };
}
