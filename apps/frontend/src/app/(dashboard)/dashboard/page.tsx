'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
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
  Bot,
  Play,
  Square,
  Pause,
  ShieldAlert,
  RotateCcw,
  Camera,
  Brain,
  ShoppingCart,
  Newspaper,
  Briefcase,
  Pizza,
  Clapperboard,
  Paperclip,
  Plus,
  X,
  Zap,
  Target,
} from 'lucide-react';
import {
  Trash2 as Trash2Icon,
  Save as SaveIcon,
  Plus as PlusIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useAgentSession } from '@/hooks/useAgentSession';
import { useAgentStore } from '@/store/agent.store';
import { ResultsPanel } from '@/components/execution/ResultsPanel';
import { ClarificationModal } from '@/components/dashboard/ClarificationModal';
import { VerificationResultPanel } from '@/components/execution/VerificationResultPanel';
import { SplitMicButton } from '@/components/voice/SplitMicButton';
import {
  getUserProfileCard,
  saveUserProfileCard,
  listSkills,
  getAgentRegistry,
  getDomainPreferences,
  getUserHistory,
  parseGoal,
} from '@/services/agent.service';
import { uploadFile } from '@/services/files.service';
import '@/styles/omnitask-dashboard.css';
import type { JobWizardResult } from '@/components/jobs/JobWizardModal';

const LiveBrowserView = dynamic(
  () => import('@/components/execution/LiveBrowserView').then((m) => m.LiveBrowserView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[480px] items-center justify-center text-xs text-zinc-500">
        Connecting to live browser stream...
      </div>
    ),
  },
);

const JobWizardModal = dynamic(
  () => import('@/components/jobs/JobWizardModal').then((m) => m.JobWizardModal),
  { ssr: false },
);

const MAX_EXECUTION_MS = 10 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

type LocalPrePhase = 'idle' | 'analyzing' | 'briefing';
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
}

// ── Static data ───────────────────────────────────────────────────────────────

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

const QUICK_PROMPTS = [
  {
    Icon: Search,
    label: 'Google Search',
    prompt: 'Search Google for the latest AI breakthroughs in 2026 and summarize the top 5 results',
  },
  {
    Icon: ShoppingCart,
    label: 'Price Compare',
    prompt: 'Compare iPhone 16 Pro prices on Amazon vs Flipkart and show a comparison table',
  },
  {
    Icon: Newspaper,
    label: 'News Digest',
    prompt: 'Find latest technology news headlines and create a summary digest of top stories',
  },
  {
    Icon: Briefcase,
    label: 'LinkedIn Jobs',
    prompt: 'Apply to senior React developer jobs on LinkedIn in Bangalore',
  },
  {
    Icon: Pizza,
    label: 'Order Food',
    prompt: 'Order chicken biryani under ₹250 on Swiggy or Zomato',
  },
  {
    Icon: Clapperboard,
    label: 'YouTube Research',
    prompt: 'Search YouTube for the best React tutorials in 2026 and list the top 10 by views',
  },
];

const JOB_KEYWORDS = [
  'job', 'jobs', 'apply', 'career', 'careers', 'vacancy', 'vacancies',
  'hiring', 'recruit', 'opening', 'openings', 'linkedin', 'naukri',
  'resume', 'cv', 'cover letter', 'application',
];

// ── Pure helpers ──────────────────────────────────────────────────────────────

function isJobRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return JOB_KEYWORDS.some((kw) => lower.includes(kw));
}

function mapActionToOpType(action: string): OpType {
  const act = action.toLowerCase();
  if (act === 'navigate') return 'navigate';
  if (act.includes('click')) return 'click';
  if (act === 'type') return 'type';
  if (act === 'scroll') return 'scroll';
  if (act === 'screenshot') return 'screenshot';
  if (act.includes('extract')) return 'extract';
  if (act === 'wait') return 'wait';
  return 'ai';
}

function mapStorePhase(phase: string): string {
  if (phase === 'idle') return 'idle';
  if (phase === 'parsing' || phase === 'planning') return 'planning';
  if (phase === 'waiting_clarification') return 'waiting_clarification';
  if (phase === 'waiting_approval') return 'waiting_approval';
  if (phase === 'paused') return 'paused';
  if (phase === 'completed') return 'completed';
  if (phase === 'failed' || phase === 'cancelled') return 'failed';
  return 'executing';
}

function generateBriefingSteps(parsed: any): string[] {
  if (!parsed) {
    return [
      'Analyze the goal and plan execution route',
      'Execute browser automation steps',
      'Verify results and return output',
    ];
  }
  switch (parsed.taskType) {
    case 'job_search':
      return [
        'Navigate to job portal(s)',
        'Search for matching roles with filters',
        'Review and select best opportunities',
        'Fill application forms with profile data',
        'Submit applications',
        'Verify submission confirmations',
      ];
    case 'food_order':
      return [
        'Open food delivery app',
        'Search for requested dish or restaurant',
        'Select best match within budget',
        'Add items to cart',
        'Review order and checkout',
      ];
    case 'shopping':
    case 'price_comparison':
      return [
        'Navigate to shopping platform(s)',
        'Search for the product',
        'Compare options by price and rating',
        'Select best match',
        'Add to cart and proceed to checkout',
      ];
    case 'research':
    case 'deep_research':
    case 'fact_check':
    case 'news_analysis':
    case 'comparison':
      return [
        'Search primary sources across the web',
        'Fetch and read relevant pages (up to 5 sources)',
        'Cross-reference and validate information',
        'Synthesize findings into a structured report',
        'Return summary with citations',
      ];
    case 'social_post':
    case 'social_schedule':
    case 'content_creation':
      return [
        'Navigate to social platform',
        'Draft content with AI assistance',
        'Review and refine the post',
        'Schedule or publish content',
      ];
    case 'email_send':
    case 'email_reply':
    case 'email_manage':
      return [
        'Open email client',
        'Compose or manage message with provided details',
        'Review for accuracy before sending',
        'Send or archive email',
      ];
    case 'ticket_booking':
    case 'hotel_booking':
    case 'flight_search':
    case 'appointment':
      return [
        'Navigate to booking platform',
        'Search with provided criteria (dates, locations)',
        'Compare available options',
        'Select best match',
        'Proceed to booking (requires your approval)',
      ];
    case 'create_event':
    case 'find_slot':
    case 'detect_conflict':
      return [
        'Open calendar application',
        'Check availability for requested time',
        'Create or schedule event with details',
        'Add attendees and send invitations',
        'Confirm and save event',
      ];
    default:
      return [
        'Analyze goal and plan execution route',
        'Navigate to relevant sites or services',
        'Execute browser automation steps',
        'Extract or verify results',
        'Return output to you',
      ];
  }
}

function getDomainLabel(taskType: string | undefined): string {
  if (!taskType) return 'General';
  const map: Record<string, string> = {
    job_search: 'Job Portals',
    food_order: 'Food Delivery',
    shopping: 'E-Commerce',
    price_comparison: 'E-Commerce',
    research: 'Web Research',
    deep_research: 'Web Research',
    fact_check: 'Web Research',
    news_analysis: 'Web Research',
    comparison: 'Web Research',
    social_post: 'Social Media',
    social_schedule: 'Social Media',
    content_creation: 'Social Media',
    email_send: 'Email',
    email_reply: 'Email',
    email_manage: 'Email',
    ticket_booking: 'Booking',
    hotel_booking: 'Travel',
    flight_search: 'Travel',
    appointment: 'Booking',
    create_event: 'Calendar',
    find_slot: 'Calendar',
    music_play: 'Media',
    video_play: 'Media',
    expense_tracking: 'Finance',
    file_create: 'Files',
    document_generation: 'Files',
  };
  return map[taskType] || 'Browser Automation';
}

function getAmbiguityInfo(score: number | undefined): { label: string; color: string } {
  if (score === undefined || score === null) return { label: 'Unknown', color: 'text-zinc-400' };
  if (score < 0.3) return { label: `Low (${score.toFixed(2)})`, color: 'text-emerald-400' };
  if (score < 0.6) return { label: `Medium (${score.toFixed(2)})`, color: 'text-yellow-400' };
  return { label: `High (${score.toFixed(2)})`, color: 'text-red-400' };
}

function formatEntities(entities: Record<string, any> | undefined): string {
  if (!entities) return 'None detected';
  const parts = Object.entries(entities)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${String(v)}`)
    .slice(0, 3);
  return parts.length > 0 ? parts.join(', ') : 'None detected';
}

// ── ProgressRing ──────────────────────────────────────────────────────────────

function ProgressRing({ progress }: { progress: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <div className="progress-ring">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle
          className="progress-ring-bg"
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          strokeWidth="3"
        />
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

// ── Main page ─────────────────────────────────────────────────────────────────

function DashboardPage() {
  const searchParams = useSearchParams();
  const sessionParam = searchParams?.get('session');
  const session = useAgentSession(sessionParam);
  const store = useAgentStore();
  const router = useRouter();

  // Pre-execution phase: idle → analyzing → briefing (before startSession is called)
  const [localPrePhase, setLocalPrePhase] = useState<LocalPrePhase>('idle');
  const [parsedGoalData, setParsedGoalData] = useState<any>(null);

  // Core UI state
  const [task, setTask] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [taskHistory, setTaskHistory] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<
    'timeline' | 'logs' | 'thoughts' | 'results' | 'profile' | 'skills'
  >('thoughts');
  const [analyzing, setAnalyzing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [jobWizardOpen, setJobWizardOpen] = useState(false);
  const [inputError, setInputError] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ id: string; name: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile/skills state
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
  const [savingProfile, setSavingProfile] = useState(false);
  const [skills, setSkills] = useState<any[]>([]);
  const [registry, setRegistry] = useState<{ agents: any[]; plugins: any[] } | null>(null);

  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(session);
  const storeRef = useRef(store);
  const launchingRef = useRef(false); // guards sync effect during startSession's internal store.reset()
  // Ref mirror of localPrePhase — lets the sync effect read the current value
  // without putting localPrePhase in its dependency array (which would cause the
  // effect to fire the moment the user clicks "Plan Mission", instantly resetting
  // the phase back to idle before the analyzing card ever renders).
  const localPrePhaseRef = useRef<LocalPrePhase>('idle');
  localPrePhaseRef.current = localPrePhase;
  useEffect(() => { sessionRef.current = session; });
  useEffect(() => { storeRef.current = store; });

  // ── Phase resolution ──────────────────────────────────────────────────────

  const storePhase = mapStorePhase(session.phase);

  // Pre-execution: localPrePhase drives the UI.
  // After startSession is called: storePhase takes over.
  const isPreExecution = localPrePhase !== 'idle' && storePhase === 'idle';
  const effectivePhase = isPreExecution ? localPrePhase : storePhase;

  const isRunning =
    storePhase === 'executing' ||
    storePhase === 'planning' ||
    storePhase === 'paused' ||
    storePhase === 'waiting_approval';

  const showHud = storePhase !== 'idle' && storePhase !== 'waiting_clarification';

  // ── Memoized computations ─────────────────────────────────────────────────

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
          [
            'Planner', 'PlannerAgent', 'BrowserAgent', 'BrowserTelemetry', 'Coordinator',
            'GoalUnderstanding', 'StrategyMemory', 'PreferenceMemory', 'VisionAgent',
            'SelfHealing', 'DriftDetector', 'VerifierAgent',
          ].includes(l.source) || l.source.includes('Agent'),
      ),
    [session.logs],
  );

  // Briefing-specific derived values
  const briefingSteps = generateBriefingSteps(parsedGoalData);
  const domainLabel = getDomainLabel(parsedGoalData?.taskType);
  const { label: ambiguityLabel, color: ambiguityColor } = getAmbiguityInfo(
    parsedGoalData?.ambiguityScore,
  );

  // ── Effects ───────────────────────────────────────────────────────────────

  // Sync localPrePhase back to 'idle' when the store resets (cancel / completion).
  // IMPORTANT: only [storePhase] in deps — if localPrePhase were here too, the
  // effect would fire the instant the user clicks "Plan Mission" and sets
  // localPrePhase → 'analyzing', seeing storePhase still 'idle', and immediately
  // reset it back, making the button appear broken. We read localPrePhase via
  // localPrePhaseRef so the closure is always fresh without triggering re-runs.
  useEffect(() => {
    if (storePhase === 'idle' && localPrePhaseRef.current !== 'idle' && !launchingRef.current) {
      setLocalPrePhase('idle');
      setParsedGoalData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storePhase]);

  // Planning-phase watchdog: warn if planning takes > 60 s with no progress.
  useEffect(() => {
    if (storePhase !== 'planning') return;
    const tid = setTimeout(() => {
      toast('Planning is taking longer than expected. The agent engine may still be starting up — please wait or retry.', {
        icon: '⚠️',
        duration: 8000,
      });
    }, 60_000);
    return () => clearTimeout(tid);
  }, [storePhase]);

  // Restore session from URL (?session=<id>)
  useEffect(() => {
    if (!sessionParam) return;
    if (store.sessionId === sessionParam) return;
    store.setSessionId(sessionParam);
    store.setPhase('executing');
    store.setGoal('Resuming session…');
    getUserHistory()
      .then((sessions: any[]) => {
        const found = sessions.find((s: any) => s.id === sessionParam);
        if (!found) return;
        const goal = found.plan?.goal || found.goal || found.naturalLanguage;
        if (goal) store.setGoal(goal);
        if (found.status === 'COMPLETED') store.setPhase('completed');
        else if (['FAILED', 'CANCELLED'].includes(found.status)) store.setPhase('failed');
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionParam]);

  // Load profile/skills/registry on mount
  useEffect(() => {
    async function loadData() {
      setProfileLoading(true);
      try {
        const [card, skillsList, registryData, domainPrefs] = await Promise.all([
          getUserProfileCard(),
          listSkills(),
          getAgentRegistry().catch(() => null),
          getDomainPreferences().catch(() => null),
        ]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Execution timer (100ms tick, hard 10-minute cap)
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedTime((p) => {
          const next = p + 100;
          if (next >= MAX_EXECUTION_MS) {
            sessionRef.current.cancel().catch(() => {});
            storeRef.current.setPhase('failed');
            storeRef.current.setError({
              message:
                'Agent timed out after 10 minutes. Try breaking the task into smaller steps.',
              source: 'Timeout',
              timestamp: Date.now(),
            });
          }
          return next;
        });
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Auto-scroll ops log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [session.logs.length, session.timeline.length, activeTab, thoughtLogs.length]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Step 1: "Plan Mission" → parseGoal() → briefing
  const handleSubmit = useCallback(async () => {
    if (!task.trim()) { setInputError(true); return; }
    if (analyzing) return;
    setInputError(false);

    // Job tasks → dedicated wizard
    if (isJobRelated(task)) { setJobWizardOpen(true); return; }

    setTaskHistory((prev) => [task, ...prev.slice(0, 4)]);
    setLocalPrePhase('analyzing');
    setAnalyzing(true);

    try {
      const result = await parseGoal(task);
      setParsedGoalData(result);
    } catch {
      setParsedGoalData(null); // show briefing with raw goal fallback
    } finally {
      setAnalyzing(false);
      setLocalPrePhase('briefing');
    }
  }, [task, analyzing]);

  // Step 2: "Launch Mission" → startSession() → live browser view
  const handleLaunchMission = useCallback(async () => {
    setLaunching(true);
    launchingRef.current = true; // prevent sync effect from firing during store.reset() inside startSession
    setElapsedTime(0);

    const goalText = attachedFile
      ? `${task}\n\n[Attached file: ${attachedFile.name}]`
      : task;

    try {
      await session.startSession({
        goal: goalText,
        mode: 'autonomous',
        profile: 'balanced',
      });
      setAttachedFile(null);
      // storePhase now drives UI (planning/executing) — clear pre-execution state
      setLocalPrePhase('idle');
    } catch (err) {
      console.error('Launch failed:', err);
      // startSession already called store.setPhase('failed'); reset to idle so hero + briefing retry is available
      storeRef.current.reset();
      setLocalPrePhase('idle');
      setParsedGoalData(null);
    } finally {
      launchingRef.current = false;
      setLaunching(false);
    }
  }, [task, session, attachedFile]);

  const handleCancelBriefing = useCallback(() => {
    setLocalPrePhase('idle');
    setParsedGoalData(null);
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const MAX_BYTES = 10 * 1024 * 1024;
      const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.png', '.jpg', '.jpeg'];
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (file.size > MAX_BYTES) { setUploadError('File too large (max 10MB)'); return; }
      if (!ALLOWED_EXT.includes(ext)) { setUploadError('Unsupported file type'); return; }
      setUploadError(null);
      setUploadingFile(true);
      try {
        const uploaded = await uploadFile(file);
        setAttachedFile(uploaded);
      } catch {
        setUploadError('Upload failed, try again');
      } finally {
        setUploadingFile(false);
      }
    },
    [],
  );

  const handleJobWizardLaunched = useCallback(
    (result: JobWizardResult) => {
      setJobWizardOpen(false);
      setTaskHistory((prev) => [task, ...prev.slice(0, 4)]);
      router.push(`/jobs?session=${result.sessionId}`);
    },
    [task, router],
  );

  const handleClarificationResolved = useCallback(
    async (_refined: any, refinedText: string) => {
      store.setClarificationQuestions(null);
      store.setClarificationGoal(null);
      setTask(refinedText);
      setLaunching(true);
      try {
        await session.startSession({ goal: refinedText, mode: 'autonomous', profile: 'balanced' });
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
    setLocalPrePhase('idle');
    setParsedGoalData(null);
  }, [handleStop]);

  const handlePauseToggle = useCallback(async () => {
    if (storePhase === 'paused') await session.resume();
    else await session.pause();
  }, [storePhase, session]);

  const saveProfileCard = async () => {
    setSavingProfile(true);
    try {
      await saveUserProfileCard(profile);
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-up w-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept=".pdf,.doc,.docx,.txt,.csv,.png,.jpg,.jpeg"
      />

      {/* Clarification modal */}
      <ClarificationModal
        open={storePhase === 'waiting_clarification'}
        questions={session.clarificationQuestions || store.clarificationQuestions || []}
        parsedGoal={session.clarificationGoal || store.clarificationGoal || session.parsedGoal}
        goalText={task}
        onClose={() => {
          store.setClarificationQuestions(null);
          store.setPhase('idle');
        }}
        onResolved={handleClarificationResolved}
      />

      {/* Job wizard */}
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
                  className="flex-1 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                >
                  Block
                </button>
                <button
                  onClick={() => session.approve(session.pendingApproval!.id)}
                  className="flex-1 h-11 rounded-xl bg-red-500 text-sm font-bold text-white hover:bg-red-400 transition-colors"
                >
                  Approve
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pre-execution phases (idle / analyzing / briefing) ── */}
      <AnimatePresence mode="wait">
        {/* IDLE: Hero input */}
        {effectivePhase === 'idle' && (
          <motion.div
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="omni-hero"
          >
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
                  Describe any task — the agent analyzes your goal, shows you the plan, then
                  executes it live in a real browser.
                </p>
              </div>

              {/* Main input */}
              <div className="task-input-glow max-w-4xl mx-auto">
                <div className="dashed-border-lg rounded-3xl bg-black/40 backdrop-blur-xl overflow-hidden">
                  <div className="p-5">
                    <textarea
                      ref={inputRef}
                      value={task}
                      onChange={(e) => {
                        setTask(e.target.value);
                        if (inputError) setInputError(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                      rows={3}
                      disabled={analyzing}
                      placeholder="Ask the agent to do anything..."
                      className="w-full resize-none bg-transparent text-[15px] text-white placeholder:text-zinc-600 focus:outline-none leading-relaxed disabled:opacity-50"
                    />
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 bg-black/20">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile}
                        title={attachedFile ? attachedFile.name : 'Attach a file'}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center bg-transparent transition-all disabled:opacity-40',
                          attachedFile ? 'text-red-400' : 'text-zinc-400 hover:text-white',
                        )}
                      >
                        {uploadingFile ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <Plus className="h-6 w-6" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <SplitMicButton
                        onTranscript={(text) =>
                          setTask((prev) => prev + (prev ? ' ' : '') + text)
                        }
                      />
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSubmit}
                        disabled={!task.trim() || analyzing}
                        className="glow-btn flex h-10 items-center gap-2 rounded-xl bg-red-500 px-6 text-sm font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-400 disabled:opacity-40"
                      >
                        {analyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Target className="h-4 w-4" />
                        )}
                        Plan Mission
                      </motion.button>
                    </div>
                  </div>
                </div>

                {attachedFile && (
                  <div className="mt-2 flex items-center justify-center">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300">
                      <Paperclip className="h-3 w-3 text-zinc-500" />
                      {attachedFile.name}
                      <button
                        type="button"
                        onClick={() => setAttachedFile(null)}
                        className="ml-1 text-zinc-500 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                )}
                {uploadError && (
                  <p className="mt-2 text-xs text-red-400 text-center animate-fade-up">
                    {uploadError}
                  </p>
                )}
                {inputError && (
                  <p className="mt-2 text-xs text-red-400 text-center animate-fade-up">
                    Please describe what you want the agent to do.
                  </p>
                )}
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
          </motion.div>
        )}

        {/* ANALYZING: Spinner while parseGoal() runs */}
        {effectivePhase === 'analyzing' && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-2xl mx-auto"
          >
            <div className="dashed-border-lg bg-black/40 backdrop-blur-xl rounded-3xl p-8">
              <div className="flex flex-col items-center gap-5 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/25 red-glow">
                  <Loader2 className="h-7 w-7 text-red-400 animate-spin" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Analyzing your mission...</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    AI is parsing goal, detecting domain, estimating approach
                  </p>
                </div>
                <div className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <p className="text-xs font-mono text-zinc-400 truncate">
                    {'"'}{task.length > 80 ? task.slice(0, 77) + '...' : task}{'"'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-red-500"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* BRIEFING: Mission review with Launch Mission button */}
        {effectivePhase === 'briefing' && (
          <motion.div
            key="briefing"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-3xl mx-auto"
          >
            <div className="dashed-border-lg bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-red-500/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/25 red-glow">
                    <Bot className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                      Mission Briefing
                    </p>
                    <h2 className="text-sm font-black text-white">Review before launch</h2>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                    Ready to Launch
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Goal */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1">
                    Mission Goal
                  </p>
                  <p className="text-sm text-white font-medium leading-relaxed">{task}</p>
                </div>

                {/* Intelligence report + parameters */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                      Intelligence Report
                    </p>
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Task Type</span>
                        <span className="text-zinc-300">
                          {parsedGoalData?.taskType || 'generic'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Domain</span>
                        <span className="text-zinc-300">{domainLabel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Ambiguity</span>
                        <span className={ambiguityColor}>{ambiguityLabel}</span>
                      </div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-zinc-500 flex-shrink-0">Entities</span>
                        <span className="text-zinc-400 text-right text-[10px] break-all">
                          {formatEntities(parsedGoalData?.entities)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                      Mission Parameters
                    </p>
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Profile</span>
                        <span className="text-zinc-300">Balanced</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Mode</span>
                        <span className="text-zinc-300">Autonomous</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Risk Level</span>
                        <span className="text-emerald-400">LOW</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Timeout</span>
                        <span className="text-zinc-300">10 min</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Planned operations */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
                    Planned Operations
                  </p>
                  <div className="space-y-2">
                    {briefingSteps.map((step, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.07 }}
                        className="flex items-center gap-3"
                      >
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03]">
                          <span className="text-[9px] font-bold text-zinc-500">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-300">{step}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Attached file notice */}
                {attachedFile && (
                  <div className="flex items-center gap-2 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-3 py-2">
                    <Paperclip className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                    <span className="text-xs text-zinc-300">
                      Attached:{' '}
                      <span className="text-blue-300 font-mono">{attachedFile.name}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 px-6 pb-6">
                <button
                  onClick={handleCancelBriefing}
                  className="flex-1 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLaunchMission}
                  disabled={launching}
                  className="flex-[2] glow-btn flex h-11 items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-400 disabled:opacity-50 transition-all"
                >
                  {launching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Launch Mission
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active goal HUD header ── */}
      {showHud && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="hud-compact-deck"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/25 red-glow">
              <Bot className="h-5 w-5 text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                Active Automation Goal
              </p>
              <h2 className="text-sm font-bold text-white truncate max-w-2xl">
                {session.goal || task}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isRunning && (
              <button
                onClick={handlePauseToggle}
                className="flex h-10 items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-xs font-bold text-zinc-300"
              >
                {storePhase === 'paused' ? (
                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Pause className="h-3.5 w-3.5 text-yellow-400" />
                )}
                {storePhase === 'paused' ? 'Resume' : 'Pause'}
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
      )}

      {/* ── Metrics bar ── */}
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
                <div
                  className={cn(
                    'metric-dot',
                    storePhase === 'paused' ? 'bg-yellow-500' : 'bg-red-500 animate-pulse',
                  )}
                />
                <div>
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                    Status
                  </p>
                  <p className="text-xs font-bold text-white capitalize">{storePhase}</p>
                </div>
              </div>
              <div className="metric-item">
                <div className="metric-dot bg-blue-500" />
                <div>
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                    Operations
                  </p>
                  <p className="text-xs font-bold text-white">
                    {completedOps}/{operations.length || session.totalSteps || '—'}
                  </p>
                </div>
              </div>
              <div className="metric-item">
                <div className="metric-dot bg-emerald-500" />
                <div>
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                    Elapsed
                  </p>
                  <p className="text-xs font-bold text-white font-mono">
                    {(elapsedTime / 1000).toFixed(1)}s
                  </p>
                </div>
              </div>
              <div className="metric-item">
                <div className="metric-dot bg-purple-500" />
                <div>
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                    Agent
                  </p>
                  <p className="text-xs font-bold text-white">
                    {currentOp?.agent || 'PlannerAgent'}
                  </p>
                </div>
              </div>
              {session.routedDomain && (
                <div className="metric-item">
                  <div className="metric-dot bg-orange-500" />
                  <div>
                    <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                      Domain
                    </p>
                    <p className="text-xs font-bold text-white capitalize">
                      {session.routedDomain}
                    </p>
                  </div>
                </div>
              )}
              {session.matchedSkills.length > 0 && (
                <div className="metric-item hidden xl:flex">
                  <div className="metric-dot bg-cyan-500" />
                  <div>
                    <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                      Skills
                    </p>
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

      {/* ── Live execution dashboard ── */}
      <AnimatePresence>
        {showHud && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="exec-dashboard"
          >
            {/* Live browser stream via WebSocket → Playwright */}
            <div className="browser-viewport min-h-[480px]">
              <LiveBrowserView
                currentScreenshot={session.currentScreenshot}
                phase={session.phase}
                executionState={session.executionState}
                errorMessage={session.lastError?.message}
                sessionId={session.sessionId}
                headfulMode={session.headfulMode}
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

              {/* Tab bar */}
              <div className="flex border-b border-white/[0.06] bg-black/20 overflow-x-auto flex-shrink-0">
                {(
                  ['thoughts', 'results', 'timeline', 'logs', 'profile', 'skills'] as const
                ).map((tab) => (
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

              {/* Tab content */}
              <div ref={logContainerRef} className="ops-log-container">
                {/* Thoughts */}
                {activeTab === 'thoughts' && (
                  <div className="space-y-3 p-2 font-mono text-[11px]">
                    {session.cognitiveState.reasoning && (
                      <div className="p-3 rounded-2xl bg-red-500/[0.03] border border-red-500/10">
                        <span className="text-[9px] text-red-400 font-bold uppercase">
                          Live Reasoning
                        </span>
                        <p className="text-zinc-200 text-xs mt-1">
                          {session.cognitiveState.reasoning}
                        </p>
                      </div>
                    )}
                    {(session.executionGraph as any)?.parallelBranches?.length > 0 && (
                      <div className="p-3 rounded-2xl bg-cyan-500/[0.03] border border-cyan-500/10">
                        <span className="text-[9px] text-cyan-400 font-bold uppercase">
                          Execution Graph
                        </span>
                        <p className="text-zinc-300 text-xs mt-1">
                          {(session.executionGraph as any).parallelBranches.length} parallel
                          branch(es): {session.matchedSkills.join(', ')}
                        </p>
                        <p className="text-zinc-500 text-[10px] mt-1">
                          {(session.executionGraph as any).nodes?.length || 0} nodes in graph
                        </p>
                      </div>
                    )}
                    {thoughtLogs.map((log, i) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-1"
                      >
                        <span className="text-[9px] text-purple-400 font-bold uppercase">
                          {log.source}
                        </span>
                        <p className="text-zinc-300 text-xs">{log.message}</p>
                      </motion.div>
                    ))}
                    {thoughtLogs.length === 0 && (
                      <div className="flex flex-col items-center py-12 text-zinc-600">
                        <Loader2 className="h-5 w-5 animate-spin mb-2" />
                        <span>Waiting for agent cognitive stream...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Results */}
                {activeTab === 'results' && (
                  <ResultsPanel results={session.agentResults} />
                )}

                {/* Timeline */}
                {activeTab === 'timeline' &&
                  (operations.length > 0 ? (
                    operations.map((op, i) => (
                      <motion.div
                        key={op.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
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
                          <p className="text-[11px] font-semibold truncate text-zinc-300">
                            {op.action}
                          </p>
                          <p className="text-[10px] text-zinc-600 truncate mt-0.5">
                            {op.detail}
                          </p>
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

                {/* Logs */}
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

                {/* Profile */}
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
                        {savingProfile ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <SaveIcon className="h-3.5 w-3.5" />
                        )}
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
                          onChange={(e) =>
                            setProfile((p: any) => ({ ...p, name: e.target.value }))
                          }
                          placeholder="Full Name"
                          className="w-full bg-white/[0.01] border border-white/5 rounded-lg px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="email"
                          value={profile.email}
                          onChange={(e) =>
                            setProfile((p: any) => ({ ...p, email: e.target.value }))
                          }
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
                              setProfile((p: any) => ({
                                ...p,
                                addresses: [...p.addresses, newAddress.trim()],
                              }));
                              setNewAddress('');
                            }}
                            className="h-8 w-8 rounded-lg bg-red-500 text-white flex items-center justify-center"
                          >
                            <PlusIcon className="h-4 w-4" />
                          </button>
                        </div>
                        {profile.addresses.map((addr: string, i: number) => (
                          <div
                            key={i}
                            className="flex justify-between p-2 rounded-lg border border-white/5 text-[11px] text-zinc-400"
                          >
                            <span className="truncate">{addr}</span>
                            <button
                              onClick={() =>
                                setProfile((p: any) => ({
                                  ...p,
                                  addresses: p.addresses.filter(
                                    (_: string, idx: number) => idx !== i,
                                  ),
                                }))
                              }
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
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
                                <div
                                  key={label as string}
                                  className="p-2 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03]"
                                >
                                  <span className="text-[9px] text-emerald-400 font-bold uppercase">
                                    {label as string}
                                  </span>
                                  <p className="text-[11px] text-zinc-300 mt-0.5">
                                    {(sites as string[]).join(', ')}
                                  </p>
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
                                No preferences learned yet — run tasks to teach OmniTask your
                                favorites.
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Skills */}
                {activeTab === 'skills' && (
                  <div className="space-y-4 p-4">
                    {registry?.agents?.map((agent) => (
                      <div
                        key={agent.id}
                        className="p-3 rounded-xl border border-red-500/10 bg-red-500/[0.02]"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-white">{agent.name}</p>
                          <span className="text-[9px] font-mono text-red-400 uppercase">
                            {agent.category}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">{agent.description}</p>
                        <p className="text-[9px] text-zinc-600 mt-2 font-mono">
                          Plugins: {agent.plugins?.join(', ') || 'none'}
                        </p>
                      </div>
                    ))}
                    <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider pt-2">
                      Site Plugins
                    </p>
                    {registry?.plugins?.map((plugin) => (
                      <div
                        key={plugin.id}
                        className="p-3 rounded-xl border border-white/5 bg-white/[0.01]"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-white">{plugin.name}</p>
                          <span className="text-[9px] text-zinc-600">v{plugin.version}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          {plugin.supportedDomains?.join(', ')}
                        </p>
                      </div>
                    ))}
                    <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider pt-2">
                      Primitive Capabilities
                    </p>
                    {skills.map((sk) => (
                      <div
                        key={sk.name}
                        className="p-3 rounded-xl border border-white/5 bg-white/[0.01]"
                      >
                        <p className="text-xs font-bold text-white">{sk.name}</p>
                        <p className="text-[10px] text-zinc-500 mt-1">{sk.description}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Completion banner */}
                {storePhase === 'completed' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="result-card success mt-4 mx-2"
                  >
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

      {/* ── Verification panel (completed / failed) ── */}
      {(storePhase === 'completed' || storePhase === 'failed') &&
        session.verificationResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-6xl mx-auto mb-6 px-4"
          >
            <VerificationResultPanel />
          </motion.div>
        )}

      {/* ── Recent tasks (idle only) ── */}
      {effectivePhase === 'idle' && taskHistory.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-4xl mx-auto"
        >
          <h3 className="text-sm font-bold text-zinc-400 mb-3 px-1">Recent Tasks</h3>
          <div className="space-y-2">
            {taskHistory.map((t) => (
              <button
                key={t}
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
      )}
    </div>
  );
}

export default function DashboardWrapper() {
  return (
    <Suspense fallback={null}>
      <DashboardPage />
    </Suspense>
  );
}
