'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Globe,
  Search,
  MousePointerClick,
  FileText,
  Eye,
  Type,
  ArrowDown,
  BrainCircuit,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Monitor,
  Chrome,
  Bot,
  Play,
  Square,
  Pause,
  ShieldAlert,
  Shield,
  RotateCcw,
  Camera,
  Brain,
  ShoppingCart,
  Newspaper,
  Briefcase,
  Pizza,
  Clapperboard,
} from 'lucide-react';
import {
  User as UserIcon,
  Mail as MailIcon,
  Phone as PhoneIcon,
  Trash2 as Trash2Icon,
  Save as SaveIcon,
  Plus as PlusIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentSession } from '@/hooks/useAgentSession';
import { useAgentStore } from '@/store/agent.store';
import { LiveBrowserView } from '@/components/execution/LiveBrowserView';
import { ResultsPanel } from '@/components/execution/ResultsPanel';
import { ClarificationModal } from '@/components/dashboard/ClarificationModal';
import { VerificationResultPanel } from '@/components/execution/VerificationResultPanel';
import { JobWizardModal, type JobWizardResult } from '@/components/jobs/JobWizardModal';
import {
  getUserProfileCard,
  saveUserProfileCard,
  listSkills,
  getAgentRegistry,
  getDomainPreferences,
  getUserHistory,
} from '@/services/agent.service';
import '@/styles/omnitask-dashboard.css';

const JOB_KEYWORDS = [
  'apply', 'application', 'linkedin', 'naukri', 'instahyre', 'hirist', 'cutshort',
  'job apply', 'apply job', 'apply for', 'apply to',
];

function isJobRelated(text: string): boolean {
  const lower = text.toLowerCase();
  const hasPortal = ['linkedin', 'naukri', 'instahyre', 'hirist', 'cutshort'].some((p) =>
    lower.includes(p),
  );
  const hasApply =
    lower.includes('apply') ||
    (lower.includes('job') && (lower.includes('find') || lower.includes('get') || lower.includes('search')));
  return hasPortal || hasApply;
}

type OpStatus = 'pending' | 'running' | 'completed' | 'failed';
type OpType =
  | 'navigate'
  | 'search'
  | 'click'
  | 'extract'
  | 'type'
  | 'scroll'
  | 'ai'
  | 'wait'
  | 'screenshot'
  | 'complete';

interface Operation {
  id: string;
  type: OpType;
  action: string;
  detail: string;
  status: OpStatus;
  agent: string;
  url?: string;
  duration?: number;
}

type DashboardPhase =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'waiting_clarification'
  | 'waiting_approval';

const OP_ICONS: Record<OpType, React.ReactNode> = {
  navigate: <Globe className="h-4 w-4 text-blue-400" />,
  search: <Search className="h-4 w-4 text-purple-400" />,
  click: <MousePointerClick className="h-4 w-4 text-yellow-400" />,
  extract: <FileText className="h-4 w-4 text-emerald-400" />,
  type: <Type className="h-4 w-4 text-pink-400" />,
  scroll: <ArrowDown className="h-4 w-4 text-sky-400" />,
  ai: <BrainCircuit className="h-4 w-4 text-red-400" />,
  wait: <Clock className="h-4 w-4 text-zinc-400" />,
  screenshot: <Camera className="h-4 w-4 text-cyan-400" />,
  complete: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
};

function mapActionToOpType(action: string): OpType {
  const act = action.toLowerCase();
  if (act === 'navigate') return 'navigate';
  if (act.includes('click')) return 'click';
  if (act === 'type') return 'type';
  if (act === 'scroll') return 'scroll';
  if (act === 'screenshot') return 'screenshot';
  if (act.includes('extract')) return 'extract';
  if (act === 'wait') return 'wait';
  if (act === 'evaluate') return 'ai';
  return 'ai';
}

function mapStorePhase(phase: string): DashboardPhase {
  if (phase === 'idle') return 'idle';
  if (phase === 'parsing' || phase === 'planning') return 'planning';
  if (phase === 'waiting_clarification') return 'waiting_clarification';
  if (phase === 'waiting_approval') return 'waiting_approval';
  if (phase === 'paused') return 'paused';
  if (phase === 'completed') return 'completed';
  if (phase === 'failed' || phase === 'cancelled') return 'failed';
  return 'executing';
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="progress-ring">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle className="progress-ring-bg" cx="26" cy="26" r={radius} fill="none" strokeWidth="3" />
        <circle
          className="progress-ring-fill"
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="progress-ring-text">{progress}%</div>
    </div>
  );
}

function DashboardPage() {
  const searchParams = useSearchParams();
  const sessionParam = searchParams?.get('session');
  const session = useAgentSession(sessionParam);
  const store = useAgentStore();
  const router = useRouter();

  const [task, setTask] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);

  // Restore session from URL (?session=<id>) — e.g. after page refresh or
  // navigating from Task History. Sets session ID in the store so the WS
  // subscription effect in useAgentSession joins the room immediately.
  useEffect(() => {
    if (!sessionParam) return;
    if (store.sessionId === sessionParam) return;
    store.setSessionId(sessionParam);
    store.setPhase('executing');
    store.setGoal('Resuming session…');
    // Try to hydrate the real goal from history
    getUserHistory().then((sessions: any[]) => {
      const found = sessions.find((s: any) => s.id === sessionParam);
      if (!found) return;
      const goal = found.plan?.goal || found.goal || found.naturalLanguage;
      if (goal) store.setGoal(goal);
      if (found.status === 'COMPLETED') store.setPhase('completed');
      else if (['FAILED', 'CANCELLED'].includes(found.status)) store.setPhase('failed');
    }).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionParam]);
  const [taskHistory, setTaskHistory] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'timeline' | 'logs' | 'thoughts' | 'results' | 'profile' | 'skills'>('thoughts');
  const [launching, setLaunching] = useState(false);
  const [jobWizardOpen, setJobWizardOpen] = useState(false);

  const [profile, setProfile] = useState<any>({
    name: '',
    email: '',
    phone: '',
    addresses: [],
    paymentPreferences: {},
    resumes: [],
    favoriteSites: [],
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newSite, setNewSite] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [skills, setSkills] = useState<any[]>([]);
  const [registry, setRegistry] = useState<{ agents: any[]; plugins: any[] } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phase = mapStorePhase(session.phase);
  const isRunning =
    phase === 'executing' ||
    phase === 'planning' ||
    phase === 'paused' ||
    phase === 'waiting_approval';

  const operations: Operation[] = useMemo(() => {
    const steps = session.plan?.steps || [];
    return steps.map((step, i) => {
      let status: OpStatus = 'pending';
      const failed = session.timeline.find(
        (t) => t.id === `step_${step.index}` && t.status === 'failed',
      );
      const completed = session.timeline.find(
        (t) => t.id === `step_${step.index}` && t.status === 'completed',
      );
      const running = session.timeline.find(
        (t) => t.id === `step_${step.index}` && t.status === 'running',
      );

      if (failed) status = 'failed';
      else if (completed) status = 'completed';
      else if (running || session.currentStepIndex === step.index) status = 'running';
      else if (step.index < session.currentStepIndex) status = 'completed';

      return {
        id: String(step.index ?? i),
        type: mapActionToOpType(step.action),
        action: step.description || `Step ${i + 1}`,
        detail: `${String(step.action).toUpperCase()}${step.target ? ` on ${step.target}` : ''}${step.value ? ` → ${step.value}` : ''}`,
        status,
        agent: step.skillName ? 'PlannerAgent' : 'BrowserAgent',
        url: step.action === 'navigate' ? step.value : undefined,
      };
    });
  }, [session.plan, session.timeline, session.currentStepIndex]);

  const completedOps = operations.filter((o) => o.status === 'completed').length;
  const progress =
    operations.length > 0 ? Math.round((completedOps / operations.length) * 100) : 0;
  const currentOp = operations.find((o) => o.status === 'running') || null;

  const thoughtLogs = useMemo(
    () =>
      session.logs.filter(
        (l) =>
          ['Planner', 'PlannerAgent', 'BrowserAgent', 'BrowserTelemetry', 'Coordinator', 'GoalUnderstanding', 'StrategyMemory', 'PreferenceMemory', 'VisionAgent', 'SelfHealing', 'DriftDetector', 'VerifierAgent'].includes(
            l.source,
          ) || l.source.includes('Agent'),
      ),
    [session.logs],
  );

  useEffect(() => {
    async function loadData() {
      setProfileLoading(true);
      try {
        const card = await getUserProfileCard();
        if (card) {
          setProfile({
            name: card.name || '',
            email: card.email || '',
            phone: card.phone || '',
            addresses: card.addresses || [],
            paymentPreferences: card.paymentPreferences || {},
            resumes: card.resumes || [],
            favoriteSites: card.favoriteSites || [],
          });
        }
        const [skillsList, registryData, domainPrefs] = await Promise.all([
          listSkills(),
          getAgentRegistry().catch(() => null),
          getDomainPreferences().catch(() => null),
        ]);
        if (skillsList) setSkills(skillsList);
        if (registryData) setRegistry(registryData);
        if (domainPrefs) store.setUserPreferences(domainPrefs);
      } catch (err) {
        console.error('Failed to load profile or skills:', err);
      } finally {
        setProfileLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setElapsedTime((p) => p + 100), 100);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [session.logs.length, session.timeline.length, activeTab, thoughtLogs.length]);

  const handleLaunch = useCallback(async () => {
    if (!task.trim() || launching || isRunning) return;

    // Job-related tasks → wizard flow instead of direct launch
    if (isJobRelated(task)) {
      setJobWizardOpen(true);
      return;
    }

    setLaunching(true);
    setElapsedTime(0);
    setTaskHistory((prev) => [task, ...prev.slice(0, 4)]);

    try {
      await session.startSession({
        goal: task,
        mode: 'autonomous',
        profile: 'balanced',
      });
    } catch (err) {
      console.error('Launch failed:', err);
    } finally {
      setLaunching(false);
    }
  }, [task, launching, isRunning, session]);

  const handleJobWizardLaunched = useCallback((result: JobWizardResult) => {
    setJobWizardOpen(false);
    setTaskHistory((prev) => [task, ...prev.slice(0, 4)]);
    router.push(`/jobs?session=${result.sessionId}`);
  }, [task, router]);

  const handleClarificationResolved = useCallback(
    async (_refined: any, refinedText: string) => {
      store.setClarificationQuestions(null);
      store.setClarificationGoal(null);
      setTask(refinedText);
      setLaunching(true);
      try {
        await session.startSession({
          goal: refinedText,
          mode: 'autonomous',
          profile: 'balanced',
        });
      } finally {
        setLaunching(false);
      }
    },
    [session, store],
  );

  const handleStop = useCallback(async () => {
    await session.cancel();
    store.reset();
    setElapsedTime(0);
  }, [session, store]);

  const handleReset = useCallback(() => {
    handleStop();
    setTask('');
  }, [handleStop]);

  const handlePauseToggle = useCallback(async () => {
    if (phase === 'paused') await session.resume();
    else await session.pause();
  }, [phase, session]);

  const saveProfileCard = async () => {
    setSavingProfile(true);
    try {
      await saveUserProfileCard(profile);
    } finally {
      setSavingProfile(false);
    }
  };

  const QUICK_PROMPTS = [
    { Icon: Search, label: 'Google Search', prompt: 'Search Google for the latest AI breakthroughs in 2026 and summarize the top 5 results' },
    { Icon: ShoppingCart, label: 'Price Compare', prompt: 'Compare iPhone 16 Pro prices on Amazon vs Flipkart and show a comparison table' },
    { Icon: Newspaper, label: 'News Digest', prompt: 'Find latest technology news headlines and create a summary digest of top stories' },
    { Icon: Briefcase, label: 'LinkedIn Jobs', prompt: 'Apply to senior React developer jobs on LinkedIn in Bangalore' },
    { Icon: Pizza, label: 'Order Food', prompt: 'Order chicken biryani under ₹250 on Swiggy or Zomato' },
    { Icon: Clapperboard, label: 'YouTube Research', prompt: 'Search YouTube for the best React tutorials in 2026 and list the top 10 by views' },
  ];

  const showHud = phase !== 'idle' && phase !== 'waiting_clarification';

  return (
    <div className="space-y-6 animate-fade-up w-full">
      <ClarificationModal
        open={phase === 'waiting_clarification'}
        questions={session.clarificationQuestions || store.clarificationQuestions || []}
        parsedGoal={session.clarificationGoal || store.clarificationGoal || session.parsedGoal}
        goalText={task}
        onClose={() => {
          store.setClarificationQuestions(null);
          store.setPhase('idle');
        }}
        onResolved={handleClarificationResolved}
      />

      <JobWizardModal
        open={jobWizardOpen}
        taskText={task}
        onClose={() => setJobWizardOpen(false)}
        onLaunched={handleJobWizardLaunched}
      />

      {/* Approval modal */}
      <AnimatePresence>
        {session.pendingApproval && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-lg rounded-[28px] border border-red-500/20 bg-zinc-950 shadow-2xl overflow-hidden"
            >
              <div className="border-b border-white/[0.06] bg-red-500/[0.02] px-6 py-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Human Approval Required</h3>
                  <p className="text-xs text-zinc-500 font-mono">STEP AUTHORIZATION REQUIRED</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-zinc-300">
                  {session.pendingApproval.actionDetails?.description ||
                    'Sensitive browser operation requested.'}
                </p>
                <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-4 text-xs font-mono text-zinc-400">
                  Risk: {session.pendingApproval.riskLevel}
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => session.deny(session.pendingApproval!.id)}
                  className="flex-1 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm font-bold text-zinc-400"
                >
                  Block
                </button>
                <button
                  onClick={() => session.approve(session.pendingApproval!.id)}
                  className="flex-1 h-11 rounded-xl bg-red-500 text-sm font-bold text-white"
                >
                  Approve
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero input — idle only */}
      {phase === 'idle' && (
        <div className="omni-hero">
          <div className="task-input-container">
            <div className="mb-6 text-center animate-fade-in">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs font-semibold text-red-300">

                <Sparkles className="h-3.5 w-3.5" />
                Autonomous AI Execution Engine
              </div>
              <h1 className="text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">
                <span className="text-gradient">What should I automate?</span>
              </h1>
              <p className="mt-2 text-sm text-zinc-500 max-w-xl mx-auto">
                Describe any task — the agent plans, launches a real browser, streams live execution, and delivers results.
              </p>
            </div>

            {/* Main input */}
            <div className="task-input-glow max-w-4xl mx-auto">
              <div className="rounded-3xl border border-dashed border-white/[0.14] bg-black/40 backdrop-blur-xl overflow-hidden">
                <div className="p-5">
                  
                  <textarea
                    ref={inputRef}
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleLaunch();
                      }
                    }}
                    
                    rows={3}
                    disabled={launching}
                    placeholder="Ask the agent to do anything..."
                    className="w-full resize-none bg-transparent text-[15px] text-white placeholder:text-zinc-600 focus:outline-none leading-relaxed disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center justify-between  border-white/[0.06] px-5 py-3 bg-black/20">
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 font-mono">
                  
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleLaunch}
                    disabled={!task.trim() || launching}
                    className="glow-btn flex h-10 items-center gap-2 rounded-xl bg-red-500 px-6 text-sm font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-400 disabled:opacity-40"
                  >
                    {launching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    Launch Agent
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Quick prompts */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="max-w-4xl mx-auto mt-5 flex flex-wrap gap-2 justify-center"
            >
              {QUICK_PROMPTS.map(({ Icon, label, prompt }, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setTask(prompt);
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-red-400 hover:border-red-500/20 transition-all"
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {label}
                </button>
              ))}
            </motion.div>
          </div>
        </div>
      )}

      {/* Active goal header */}
      {showHud && (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="hud-compact-deck">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/25 red-glow">
          <Bot className="h-5 w-5 text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Active Automation Goal</p>
          <h2 className="text-sm font-bold text-white truncate max-w-2xl">{session.goal || task}</h2>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isRunning && (
          <button
            onClick={handlePauseToggle}
            className="flex h-10 items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-xs font-bold text-zinc-300"
          >
            {phase === 'paused' ? (
              <Play className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Pause className="h-3.5 w-3.5 text-yellow-400" />
            )}
            {phase === 'paused' ? 'Resume' : 'Pause'}
          </button>
        )}
        {isRunning ? (
          <button
            onClick={handleStop}
            className="flex h-10 items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-5 text-xs font-bold text-red-400"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Abort Goal
          </button>
        ) : (
          <button
            onClick={handleReset}
            className="flex h-10 items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-5 text-xs font-bold text-zinc-300"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New Task
          </button>
        )}
      </div>
    </motion.div>
  )
}

{/* Metrics bar */ }
<AnimatePresence>
  {showHud && (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="metrics-bar"
    >
      <ProgressRing progress={progress} />
      <div className="flex-1 flex items-center gap-6 flex-wrap">
        <div className="metric-item">
          <div className={cn('metric-dot', phase === 'paused' ? 'bg-yellow-500' : 'bg-red-500 animate-pulse')} />
          <div>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Status</p>
            <p className="text-xs font-bold text-white capitalize">{phase}</p>
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-dot bg-blue-500" />
          <div>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Operations</p>
            <p className="text-xs font-bold text-white">
              {completedOps}/{operations.length || session.totalSteps || '—'}
            </p>
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-dot bg-emerald-500" />
          <div>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Elapsed</p>
            <p className="text-xs font-bold text-white font-mono">{(elapsedTime / 1000).toFixed(1)}s</p>
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-dot bg-purple-500" />
          <div>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Agent</p>
            <p className="text-xs font-bold text-white">{currentOp?.agent || 'PlannerAgent'}</p>
          </div>
        </div>
        {session.routedDomain && (
          <div className="metric-item">
            <div className="metric-dot bg-orange-500" />
            <div>
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Domain</p>
              <p className="text-xs font-bold text-white capitalize">{session.routedDomain}</p>
            </div>
          </div>
        )}
        {session.matchedSkills.length > 0 && (
          <div className="metric-item hidden xl:flex">
            <div className="metric-dot bg-cyan-500" />
            <div>
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Skills</p>
              <p className="text-[10px] font-bold text-zinc-300 font-mono truncate max-w-[140px]">
                {session.matchedSkills.length} active
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )}
</AnimatePresence>

{/* Live execution dashboard */ }
<AnimatePresence>
  {showHud && (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="exec-dashboard"
    >
      {/* Live browser — real Playwright stream via WebSocket */}
      <div className="browser-viewport min-h-[480px]">
        <LiveBrowserView
          currentScreenshot={session.currentScreenshot}
          phase={session.phase}
          executionState={session.executionState}
          errorMessage={session.lastError?.message}
          sessionId={session.sessionId}
        />
      </div>

      {/* Operations panel */}
      <div className="ops-panel">
        <div className="ops-panel-header">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-red-400" />
            <h3 className="text-[13px] font-bold text-white">Operations Dashboard</h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-600">
            {completedOps}/{operations.length || session.totalSteps || 0} steps
          </span>
        </div>

        <div className="flex border-b border-white/[0.06] bg-black/20 overflow-x-auto flex-shrink-0">
          {(['thoughts', 'results', 'timeline', 'logs', 'profile', 'skills'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all capitalize',
                activeTab === tab
                  ? 'border-red-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >
              {tab === 'logs'
                ? `Logs (${session.logs.length})`
                : tab === 'skills'
                  ? `Skills (${skills.length})`
                  : tab === 'results'
                    ? `Results (${session.agentResults.length})`
                    : tab.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div ref={logContainerRef} className="ops-log-container">
          {activeTab === 'thoughts' && (
            <div className="space-y-3 p-2 font-mono text-[11px]">
              {session.cognitiveState.reasoning && (
                <div className="p-3 rounded-2xl bg-red-500/[0.03] border border-red-500/10">
                  <span className="text-[9px] text-red-400 font-bold uppercase">Live Reasoning</span>
                  <p className="text-zinc-200 text-xs mt-1">{session.cognitiveState.reasoning}</p>
                </div>
              )}
              {session.executionGraph?.parallelBranches?.length > 0 && (
                <div className="p-3 rounded-2xl bg-cyan-500/[0.03] border border-cyan-500/10">
                  <span className="text-[9px] text-cyan-400 font-bold uppercase">Execution Graph</span>
                  <p className="text-zinc-300 text-xs mt-1">
                    {session.executionGraph.parallelBranches.length} parallel branch(es):{' '}
                    {session.matchedSkills.join(', ')}
                  </p>
                  <p className="text-zinc-500 text-[10px] mt-1">
                    {session.executionGraph.nodes?.length || 0} nodes in execution graph
                  </p>
                </div>
              )}
              {thoughtLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-1"
                >
                  <span className="text-[9px] text-purple-400 font-bold uppercase">{log.source}</span>
                  <p className="text-zinc-300 text-xs">{log.message}</p>
                </div>
              ))}
              {thoughtLogs.length === 0 && (
                <div className="flex flex-col items-center py-12 text-zinc-600">
                  <Loader2 className="h-5 w-5 animate-spin mb-2" />
                  <span>Waiting for agent cognitive stream...</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'results' && <ResultsPanel results={session.agentResults} />}

          {activeTab === 'timeline' &&
            (operations.length > 0 ? (
              operations.map((op, i) => (
                <motion.div
                  key={op.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={cn(
                    'ops-entry',
                    op.status === 'running' && 'active',
                    op.status === 'completed' && 'completed',
                  )}
                >
                  <div className={cn('ops-icon', op.type)}>
                    {op.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 text-red-400 animate-spin" />
                    ) : op.status === 'completed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : op.status === 'failed' ? (
                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                    ) : (
                      OP_ICONS[op.type]
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate text-zinc-300">{op.action}</p>
                    <p className="text-[10px] text-zinc-600 truncate mt-0.5">{op.detail}</p>
                    <span className="text-[9px] text-zinc-600 font-mono">{op.agent}</span>
                  </div>
                </motion.div>
              ))
            ) : (
              session.timeline.map((entry) => (
                <div key={entry.id} className="ops-entry p-3">
                  <p className="text-[11px] font-semibold text-zinc-300">{entry.title}</p>
                  <p className="text-[10px] text-zinc-600">{entry.description}</p>
                </div>
              ))
            ))}

          {activeTab === 'logs' && (
            <div className="font-mono text-[10px] text-zinc-400 space-y-1 px-2">
              {session.logs.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-zinc-600">
                  <Eye className="h-5 w-5 mb-2 opacity-50" />
                  <span>Listening for runtime logs...</span>
                </div>
              ) : (
                session.logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 py-0.5">
                    <span className="text-zinc-600 flex-shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-zinc-500 uppercase text-[8px]">{log.level}</span>
                    <span className="text-zinc-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4 p-4 text-left font-mono text-xs">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h4 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                  <Brain className="h-4 w-4 text-red-400" />
                  User Profile Memory
                </h4>
                <button
                  onClick={saveProfileCard}
                  disabled={savingProfile}
                  className="h-8 px-3 rounded-lg bg-red-500 text-[10px] font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingProfile ? <Loader2 className="h-3 w-3 animate-spin" /> : <SaveIcon className="h-3.5 w-3.5" />}
                  SAVE
                </button>
              </div>
              {profileLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile((p: any) => ({ ...p, name: e.target.value }))}
                    placeholder="Full Name"
                    className="w-full bg-white/[0.01] border border-white/5 rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile((p: any) => ({ ...p, email: e.target.value }))}
                    placeholder="Email"
                    className="w-full bg-white/[0.01] border border-white/5 rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="Add address..."
                      className="flex-1 bg-white/[0.01] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                    <button
                      onClick={() => {
                        if (!newAddress.trim()) return;
                        setProfile((p: any) => ({ ...p, addresses: [...p.addresses, newAddress.trim()] }));
                        setNewAddress('');
                      }}
                      className="h-8 w-8 rounded-lg bg-red-500 text-white flex items-center justify-center"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                  {profile.addresses.map((addr: string, i: number) => (
                    <div key={i} className="flex justify-between p-2 rounded-lg border border-white/5 text-[11px] text-zinc-400">
                      <span className="truncate">{addr}</span>
                      <button
                        onClick={() =>
                          setProfile((p: any) => ({
                            ...p,
                            addresses: p.addresses.filter((_: string, idx: number) => idx !== i),
                          }))
                        }
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {/* Learned domain preferences */}
                  {session.userPreferences && (
                    <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                      <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        Learned Preferences
                      </h5>
                      {[
                        ['Job Sites', session.userPreferences.preferredJobSites],
                        ['Food Apps', session.userPreferences.preferredFoodApps],
                        ['Shopping', session.userPreferences.preferredShoppingSites],
                        ['Travel', session.userPreferences.preferredTravelSites],
                      ].map(([label, sites]) =>
                        (sites as string[]).length > 0 ? (
                          <div key={label as string} className="p-2 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03]">
                            <span className="text-[9px] text-emerald-400 font-bold uppercase">{label as string}</span>
                            <p className="text-[11px] text-zinc-300 mt-0.5">{(sites as string[]).join(', ')}</p>
                          </div>
                        ) : null,
                      )}
                      {![
                        ...session.userPreferences.preferredJobSites,
                        ...session.userPreferences.preferredFoodApps,
                        ...session.userPreferences.preferredShoppingSites,
                        ...session.userPreferences.preferredTravelSites,
                      ].length && (
                          <p className="text-[10px] text-zinc-600 italic">
                            No preferences learned yet — run tasks to teach OmniTask your favorites.
                          </p>
                        )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'skills' && (
            <div className="space-y-4 p-4">
              {registry?.agents?.map((agent) => (
                <div key={agent.id} className="p-3 rounded-xl border border-red-500/10 bg-red-500/[0.02]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white">{agent.name}</p>
                    <span className="text-[9px] font-mono text-red-400 uppercase">{agent.category}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">{agent.description}</p>
                  <p className="text-[9px] text-zinc-600 mt-2 font-mono">
                    Plugins: {agent.plugins?.join(', ') || 'none'}
                  </p>
                </div>
              ))}
              <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider pt-2">Site Plugins</p>
              {registry?.plugins?.map((plugin) => (
                <div key={plugin.id} className="p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white">{plugin.name}</p>
                    <span className="text-[9px] text-zinc-600">v{plugin.version}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">{plugin.supportedDomains?.join(', ')}</p>
                </div>
              ))}
              <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider pt-2">Primitive Capabilities</p>
              {skills.map((sk) => (
                <div key={sk.name} className="p-3 rounded-xl border border-white/5 bg-white/[0.01]">
                  <p className="text-xs font-bold text-white">{sk.name}</p>
                  <p className="text-[10px] text-zinc-500 mt-1">{sk.description}</p>
                </div>
              ))}
            </div>
          )}

          {phase === 'completed' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="result-card success mt-4 mx-2">
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <h4 className="text-sm font-bold text-emerald-400">Execution Complete</h4>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>

{/* Verification 2.0 — evidence-based completion report */ }
{
  (phase === 'completed' || phase === 'failed') && session.verificationResult && (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto mb-6 px-4"
    >
      <VerificationResultPanel />
    </motion.div>
  )
}

{
  phase === 'idle' && taskHistory.length > 0 && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto">
      <h3 className="text-sm font-bold text-zinc-400 mb-3 px-1">Recent Tasks</h3>
      <div className="space-y-2">
        {taskHistory.map((t, i) => (
          <button
            key={i}
            onClick={() => {
              setTask(t);
              inputRef.current?.focus();
            }}
            className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-all truncate"
          >
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
    </div >
  );
}

export default function DashboardWrapper() {
  return (
    <Suspense fallback={null}>
      <DashboardPage />
    </Suspense>
  );
}
