'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
} from 'lucide-react';

import { TaskList } from '@/components/tasks/TaskList';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { useTasks, useCreateTask } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';

/* ===========================================================
   STATUS TABS
=========================================================== */

const STATUS_TABS = [
  { id: 'all', label: 'All Tasks', status: undefined },
  { id: 'running', label: 'Running', status: 'RUNNING' },
  { id: 'queued', label: 'Queued', status: 'QUEUED' },
  { id: 'completed', label: 'Completed', status: 'COMPLETED' },
  { id: 'failed', label: 'Failed', status: 'FAILED' },
];

/* ===========================================================
   PAGE
=========================================================== */

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: tasks, isLoading, refetch, isFetching } = useTasks();
  const createTask = useCreateTask();

  const activeStatus = STATUS_TABS.find((t) => t.id === activeTab)?.status;

  // Filter tasks by search
  const filteredTasks = tasks?.filter((task: any) => {
    const matchesSearch =
      !searchQuery ||
      task.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.naturalLanguage?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = !activeStatus || task.status === activeStatus;

    return matchesSearch && matchesStatus;
  });

  const handleTaskSubmit = async (data: {
    prompt: string;
    mode: string;
    priority: string;
  }) => {
    await createTask.mutateAsync({
      naturalLanguage: data.prompt,
      // @ts-ignore
      mode: data.mode,
      priority: data.priority,
    });
    setShowCreateForm(false);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Task Execution Center
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Monitor and manage all autonomous workflows
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={cn(
              'flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-white',
              isFetching && 'opacity-50 cursor-not-allowed',
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>

          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex h-9 items-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-400 transition-all shadow-lg shadow-red-500/20"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      {/* ================================================= */}
      {/* CREATE FORM (COLLAPSIBLE) */}
      {/* ================================================= */}
      {showCreateForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <DashboardHero
            onSubmit={handleTaskSubmit}
            isLoading={createTask.isPending}
          />
        </motion.div>
      )}

      {/* ================================================= */}
      {/* FILTERS + TABS */}
      {/* ================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1 backdrop-blur-xl overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {tab.label}
              {tab.status && (
                <span className="ml-2 text-xs opacity-60">
                  {tasks?.filter((t: any) => t.status === tab.status).length || 0}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search + View Toggle */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="h-9 w-64 rounded-xl border border-white/[0.07] bg-white/[0.02] pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/30 focus:bg-white/[0.04] focus:outline-none transition-all"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-black/30 p-1">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg transition-all',
                viewMode === 'list'
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg transition-all',
                viewMode === 'grid'
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* TASK LIST */}
      {/* ================================================= */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 backdrop-blur-xl overflow-hidden">
        <TaskList
          variant={viewMode === 'grid' ? 'grid' : 'full'}
          status={activeStatus}
          emptyTitle={
            searchQuery
              ? 'No tasks match your search'
              : `No ${activeTab} tasks`
          }
          emptyMessage={
            searchQuery
              ? 'Try adjusting your search query'
              : 'Launch a new task to get started'
          }
        />
      </div>
    </div>
  );
}