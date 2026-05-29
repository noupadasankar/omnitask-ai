'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BrainCircuit,
  Database,
  Clock,
  HardDrive,
  Layers,
  Search,
  RefreshCw,
  Sparkles,
  Activity,
  Cpu,
  GitBranch,
  Zap,
  Plus,
  Trash2,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock Memory Data
const MEMORIES = [
  {
    id: 'mem-1',
    content: 'User prefers dark mode and HSL tailored color schemes for dashboard layouts.',
    type: 'Semantic',
    category: 'User Preferences',
    confidence: '98%',
    created: '10 mins ago',
  },
  {
    id: 'mem-2',
    content: 'Next.js 14 routing uses app directory layout with nested layouts.',
    type: 'Procedural',
    category: 'Codebase Patterns',
    confidence: '95%',
    created: '2 hours ago',
  },
  {
    id: 'mem-3',
    content: 'Competitor pricing crawler needs to run with a user-agent header mimicking chrome.',
    type: 'Episodic',
    category: 'Task Execution',
    confidence: '91%',
    created: '1 day ago',
  },
  {
    id: 'mem-4',
    content: 'Prisma schema model "Task" has status field of type TaskStatus.',
    type: 'Procedural',
    category: 'Database Schema',
    confidence: '99%',
    created: '2 days ago',
  },
  {
    id: 'mem-5',
    content: 'Frontend is running on port 3000, backend is proxying requests to port 4000.',
    type: 'Working',
    category: 'Environment Config',
    confidence: '100%',
    created: '3 days ago',
  },
];

const MEMORY_TYPES = [
  {
    id: 'working',
    name: 'Working Memory',
    desc: 'Short-term context for active tasks and execution buffers.',
    count: '12 Contexts',
    size: '148 KB',
    updated: 'Active now',
    icon: Cpu,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    id: 'semantic',
    name: 'Semantic Memory',
    desc: 'Long-term embeddings and knowledge representation from past runs.',
    count: '247 Embeddings',
    size: '12.4 MB',
    updated: '2 hours ago',
    icon: BrainCircuit,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  {
    id: 'episodic',
    name: 'Episodic Memory',
    desc: 'Specific execution traces, logs, and screenshots of tasks.',
    count: '82 Replays',
    size: '284.5 MB',
    updated: '10 mins ago',
    icon: Clock,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  {
    id: 'procedural',
    name: 'Procedural Memory',
    desc: 'Learned workflow patterns, tools, and execution strategies.',
    count: '18 Skills',
    size: '1.2 MB',
    updated: '1 day ago',
    icon: GitBranch,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
];

export default function MemoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [memories, setMemories] = useState(MEMORIES);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleDelete = (id: string) => {
    setMemories(memories.filter((m) => m.id !== id));
  };

  const filteredMemories = memories.filter((m) => {
    const matchesSearch =
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType =
      selectedType === 'all' || m.type.toLowerCase() === selectedType.toLowerCase();
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-8 animate-fade-up">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-purple-500/25 bg-purple-500/10 px-3 py-1 text-xs text-purple-300">
            <BrainCircuit className="h-3.5 w-3.5" />
            Knowledge Base
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            AI Memory Engine
          </h1>
          <p className="mt-1 text-zinc-400">
            Semantic knowledge store powering runtime agent intelligence and execution recall.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white transition-all"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            Sync Store
          </button>
          <button className="flex h-10 items-center gap-2 rounded-xl bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-500 transition-all shadow-lg shadow-purple-600/20">
            <Plus className="h-4 w-4" />
            Add Entry
          </button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Memories"
          value="2,847"
          change="+14 today"
          icon={Database}
          color="text-blue-400"
        />
        <StatCard
          title="Vector Embeddings"
          value="12.4K"
          change="384 dimensions"
          icon={Layers}
          color="text-purple-400"
        />
        <StatCard
          title="Knowledge Nodes"
          value="84"
          change="Linked entities"
          icon={BookOpen}
          color="text-emerald-400"
        />
        <StatCard
          title="Memory Utilized"
          value="73%"
          change="298.3 MB / 500 MB"
          icon={HardDrive}
          color="text-amber-400"
        />
      </div>

      {/* MEMORY TYPE CLUSTERS */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Memory Clusters</h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {MEMORY_TYPES.map((type) => {
            const Icon = type.icon;
            return (
              <motion.div
                key={type.id}
                whileHover={{ y: -4 }}
                className={cn(
                  'rounded-3xl border bg-white/[0.02] p-5 backdrop-blur-xl transition-all cursor-pointer hover:bg-white/[0.04]',
                  type.border
                )}
                onClick={() => setSelectedType(type.id)}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', type.bg, type.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs text-zinc-500">{type.updated}</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{type.name}</h3>
                <p className="text-xs text-zinc-500 mb-4 min-h-[32px] leading-relaxed">{type.desc}</p>
                <div className="flex items-center justify-between border-t border-white/[0.05] pt-3 text-xs">
                  <span className="font-semibold text-zinc-400">{type.count}</span>
                  <span className="text-zinc-600">{type.size}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* EXPLORER & OPERATIONS */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_0.5fr]">
        {/* SEMANTIC EXPLORER */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Semantic Memory Explorer</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Query and search the active long-term database</p>
            </div>

            {/* Type Filters */}
            <div className="flex gap-1.5 rounded-lg border border-white/[0.05] bg-black/40 p-1">
              {['all', 'semantic', 'procedural', 'episodic', 'working'].map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedType(t)}
                  className={cn(
                    'rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all',
                    selectedType === t
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/10'
                      : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Search bar */}
          <div className="relative mb-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories by keyword, tags, or concepts..."
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-white/[0.07] bg-white/[0.01] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/30 focus:bg-white/[0.03] transition-all"
            />
          </div>

          {/* Memory List */}
          <div className="space-y-3">
            {filteredMemories.length > 0 ? (
              filteredMemories.map((mem) => (
                <div
                  key={mem.id}
                  className="group relative flex items-start gap-4 rounded-2xl border border-white/[0.05] bg-black/20 p-4 transition-all hover:bg-white/[0.01] hover:border-white/[0.08]"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-purple-500/15 border border-purple-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300">
                        {mem.type}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {mem.category}
                      </span>
                      <span className="ml-auto text-[10px] text-zinc-600">
                        {mem.created}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed pt-1 pr-6">{mem.content}</p>
                  </div>

                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleDelete(mem.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Erase memory"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 border border-dashed border-white/[0.05] rounded-2xl">
                <BrainCircuit className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400 font-semibold">No memories match query</p>
                <p className="text-xs text-zinc-600 mt-1">Try resetting filters or changing terms</p>
              </div>
            )}
          </div>
        </div>

        {/* OPERATIONS TIMELINE */}
        <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Operations</h2>
          <div className="space-y-4">
            <TimelineItem
              title="Vector Write"
              desc="Ingested task 247 results"
              time="10m ago"
              icon={Zap}
              color="text-emerald-400"
              bg="bg-emerald-500/10"
            />
            <TimelineItem
              title="Graph Link Created"
              desc="Linked 'Next.js' to 'Routing'"
              time="2h ago"
              icon={GitBranch}
              color="text-blue-400"
              bg="bg-blue-500/10"
            />
            <TimelineItem
              title="Recall Query"
              desc="Retrieved 3 execution templates"
              time="4h ago"
              icon={Search}
              color="text-purple-400"
              bg="bg-purple-500/10"
            />
            <TimelineItem
              title="Memory Optimised"
              desc="Pruned 14 duplicate vector nodes"
              time="1d ago"
              icon={Activity}
              color="text-amber-400"
              bg="bg-amber-500/10"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  change: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-zinc-500">{title}</span>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-black/30', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="text-[10px] text-zinc-600 mt-2 font-medium">{change}</p>
    </div>
  );
}

function TimelineItem({
  title,
  desc,
  time,
  icon: Icon,
  color,
  bg,
}: {
  title: string;
  desc: string;
  time: string;
  icon: any;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex gap-3">
      <div className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', bg, color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-white truncate">{title}</p>
        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{desc}</p>
      </div>
      <span className="text-[10px] text-zinc-600 flex-shrink-0 mt-0.5">{time}</span>
    </div>
  );
}
