'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

import {
  getAgentRegistry,
  getUserMemories,
  getUserHistory,
  getDomainPreferences,
  saveDomainPreferences,
  getSchedules,
  createSchedule,
  deleteSchedule,
  type UserDomainPreferences,
} from '@/services/agent.service';

/* ===========================================================
   AGENTS  →  GET /agent/registry
=========================================================== */

export function useAgentRegistry() {
  return useQuery({
    queryKey: ['agent-registry'],
    queryFn: getAgentRegistry,
    refetchInterval: 15000,
    staleTime: 5000,
  });
}

/* ===========================================================
   MEMORY  →  GET /agent/memory
=========================================================== */

export function useMemories() {
  return useQuery({
    queryKey: ['agent-memories'],
    queryFn: getUserMemories,
    refetchInterval: 15000,
    staleTime: 5000,
  });
}

/* ===========================================================
   ANALYTICS  →  GET /agent/history
=========================================================== */

export function useExecutionHistory() {
  return useQuery({
    queryKey: ['agent-history'],
    queryFn: getUserHistory,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

/* ===========================================================
   SETTINGS  →  GET/PUT /agent/preferences
=========================================================== */

export function useDomainPreferences() {
  return useQuery({
    queryKey: ['domain-preferences'],
    queryFn: getDomainPreferences,
    staleTime: 30000,
  });
}

export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: UserDomainPreferences) => saveDomainPreferences(prefs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domain-preferences'] });
      toast.success('Settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });
}

/* ===========================================================
   WORKFLOWS  →  GET/POST/DELETE /agent/schedules
=========================================================== */

export function useSchedules() {
  return useQuery({
    queryKey: ['agent-schedules'],
    queryFn: getSchedules,
    refetchInterval: 20000,
    staleTime: 5000,
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-schedules'] });
      toast.success('Workflow created');
    },
    onError: () => toast.error('Failed to create workflow'),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-schedules'] });
      toast.success('Workflow deleted');
    },
    onError: () => toast.error('Failed to delete workflow'),
  });
}
