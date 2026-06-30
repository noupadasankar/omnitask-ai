import { RiskLevel, JobApplicationStatus } from '@prisma/client';

export function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' ? (value as Record<string, any>) : null;
}

export function toRiskLevel(
  value: unknown,
  fallback: RiskLevel = RiskLevel.LOW,
): RiskLevel {
  switch (value) {
    case 'CRITICAL':
      return RiskLevel.CRITICAL;
    case 'HIGH':
      return RiskLevel.HIGH;
    case 'MEDIUM':
      return RiskLevel.MEDIUM;
    case 'LOW':
      return RiskLevel.LOW;
    default:
      return fallback;
  }
}

export function extractDomain(metadata: unknown): string {
  const metadataRecord = asRecord(metadata);
  if (typeof metadataRecord?.routedDomain === 'string') {
    return metadataRecord.routedDomain;
  }

  const parsedGoal = asRecord(metadataRecord?.parsedGoal);
  const taskType = parsedGoal?.taskType;
  const categoryMap: Record<string, string> = {
    job_search: 'job',
    food_order: 'food',
    shopping: 'shopping',
    price_comparison: 'shopping',
    ticket_booking: 'travel',
    hotel_booking: 'travel',
    flight_search: 'travel',
    research: 'research',
  };

  return typeof taskType === 'string' ? categoryMap[taskType] || 'general' : 'general';
}

export function extractPluginIds(plan: unknown, metadata: unknown): string[] {
  const ids = new Set<string>();
  const metadataRecord = asRecord(metadata);
  const planRecord = asRecord(plan);

  const matchedSkills = Array.isArray(metadataRecord?.matchedSkills)
    ? metadataRecord.matchedSkills
    : [];
  for (const skill of matchedSkills) {
    if (typeof skill === 'string' && skill.includes('-')) {
      ids.add(skill);
    }
  }

  const skillsUsed = Array.isArray(planRecord?.skillsUsed)
    ? planRecord.skillsUsed
    : [];
  for (const skill of skillsUsed) {
    if (typeof skill === 'string' && skill.includes('-')) {
      ids.add(skill);
    }
  }

  const steps = Array.isArray(planRecord?.steps) ? planRecord.steps : [];
  for (const step of steps) {
    const stepRecord = asRecord(step);
    if (
      typeof stepRecord?.skillName === 'string' &&
      stepRecord.skillName.includes('-')
    ) {
      ids.add(stepRecord.skillName);
    }
  }

  const branches = Array.isArray(asRecord(planRecord?.metadata)?.branches)
    ? (asRecord(planRecord?.metadata)?.branches as Array<Record<string, any>>)
    : [];
  for (const branch of branches) {
    if (typeof branch.id === 'string' && branch.id.includes('-')) {
      ids.add(branch.id);
    }
    if (typeof branch.skill === 'string' && branch.skill.includes('-')) {
      ids.add(branch.skill);
    }
  }

  return [...ids];
}

export function toJobStatus(value: unknown): JobApplicationStatus {
  switch (value) {
    case 'APPLIED':
      return JobApplicationStatus.APPLIED;
    case 'FAILED':
      return JobApplicationStatus.FAILED;
    case 'PENDING_APPROVAL':
      return JobApplicationStatus.PENDING_APPROVAL;
    case 'MATCHED':
      return JobApplicationStatus.MATCHED;
    case 'QUEUED':
    case 'PENDING':
      return JobApplicationStatus.QUEUED;
    case 'PROCESSING':
      return JobApplicationStatus.PROCESSING;
    case 'SKIPPED':
    default:
      return JobApplicationStatus.SKIPPED;
  }
}

export function sumWorkerDurations(results: unknown): number {
  if (!Array.isArray(results)) return 0;
  return results.reduce((total, result) => {
    const duration = asRecord(result)?.durationMs;
    return total + (typeof duration === 'number' ? duration : 0);
  }, 0);
}
