export const AGENT_EVENTS = {
  TASK_STARTED: "agent.task.started",
  TASK_COMPLETED: "agent.task.completed",
  TASK_FAILED: "agent.task.failed",
  STEP_COMPLETED: "agent.step.completed",
  STEP_FAILED: "agent.step.failed",
  APPROVAL_REQUIRED: "agent.approval.required",
} as const;
export type AgentEventType = typeof AGENT_EVENTS[keyof typeof AGENT_EVENTS];
