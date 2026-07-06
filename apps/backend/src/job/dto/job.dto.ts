import { z } from 'zod';

export const JobPreferenceSchema = z.object({
  preferredRoles: z.array(z.string()).optional(),
  excludedRoles: z.array(z.string()).optional(),
  preferredCompanies: z.array(z.string()).optional(),
  excludedCompanies: z.array(z.string()).optional(),
  preferredLocations: z.array(z.string()).optional(),
  remoteOnly: z.boolean().optional(),
  minSalary: z.number().int().positive().optional(),
  maxApplications: z.number().int().positive().optional(),
  keywords: z.array(z.string()).optional(),
  excludedKeywords: z.array(z.string()).optional(),
  autoApply: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
});

export type JobPreferenceDto = z.infer<typeof JobPreferenceSchema>;

const JobPostingSchema = z.object({
  portal: z.string().min(1),
  externalJobId: z.string().min(1),
  title: z.string().min(1),
  company: z.string().optional(),
  location: z.string().optional(),
  url: z.string().url().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  salary: z.number().nullable().optional(),
  remote: z.boolean().optional(),
}).passthrough();

export const EvaluateJobsSchema = z.object({
  jobs: z.array(JobPostingSchema).min(1, 'At least one job required'),
});

export type EvaluateJobsDto = z.infer<typeof EvaluateJobsSchema>;

export const LaunchJobAgentSchema = z.object({
  goal: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  maxApplications: z.number().int().positive().optional(),
  autoApply: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  sessionId: z.string().optional(),
  portals: z.array(z.string()).optional(),
});

export type LaunchJobAgentDto = z.infer<typeof LaunchJobAgentSchema>;

export const StopJobAgentSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

export type StopJobAgentDto = z.infer<typeof StopJobAgentSchema>;
