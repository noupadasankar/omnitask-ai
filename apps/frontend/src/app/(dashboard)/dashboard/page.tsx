'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Send,
  Globe,
  Search,
  MousePointerClick,
  FileText,
  Download,
  Eye,
  Type,
  ArrowDown,
  Cpu,
  Bot,
  BrainCircuit,
  Zap,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Monitor,
  Chrome,
  ExternalLink,
  ChevronRight,
  Maximize2,
  RotateCcw,
  Camera,
  Play,
  Square,
  ArrowRight,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Check,
  X,
  Pause,
  ThumbsUp,
  MessageSquare,
  Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSocket } from '@/providers/SocketProvider';
import { useAuth } from '@/hooks/useAuth';
import { taskService } from '@/services/task.service';
import {
  startAgentExecution,
  getAgentSessionSteps,
  getUserProfileCard,
  saveUserProfileCard,
  listSkills
} from '@/services/agent.service';
import {
  User as UserIcon,
  Mail as MailIcon,
  Phone as PhoneIcon,
  MapPin as MapPinIcon,
  Trash2 as Trash2Icon,
  Save as SaveIcon,
  Plus as PlusIcon
} from 'lucide-react';
import '@/styles/omnitask-dashboard.css';

/* ===========================================================
   TYPES
=========================================================== */

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
  output?: string;
}

type ExecutionPhase = 'idle' | 'planning' | 'executing' | 'completed' | 'failed' | 'paused';

/* ===========================================================
   OPERATION ICON MAP
=========================================================== */

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

/* ===========================================================
   TASK SCENARIO GENERATOR
   Generates realistic operation sequences from user prompts
=========================================================== */

function generateOperations(task: string): Operation[] {
  const lower = task.toLowerCase();

  // Detect intent from natural language
  const isSearch =
    lower.includes('search') ||
    lower.includes('google') ||
    lower.includes('find') ||
    lower.includes('look up') ||
    lower.includes('look for');
  const isScrape =
    lower.includes('scrape') ||
    lower.includes('extract') ||
    lower.includes('get data') ||
    lower.includes('collect');
  const isCompare =
    lower.includes('compare') ||
    lower.includes('vs') ||
    lower.includes('versus') ||
    lower.includes('difference');
  const isEmail =
    lower.includes('email') ||
    lower.includes('gmail') ||
    lower.includes('send mail') ||
    lower.includes('mail');
  const isSocial =
    lower.includes('linkedin') ||
    lower.includes('twitter') ||
    lower.includes('facebook') ||
    lower.includes('instagram') ||
    lower.includes('post');
  const isShop =
    lower.includes('amazon') ||
    lower.includes('buy') ||
    lower.includes('price') ||
    lower.includes('shop') ||
    lower.includes('product');
  const isNews =
    lower.includes('news') ||
    lower.includes('article') ||
    lower.includes('headline') ||
    lower.includes('latest');
  const isWeather =
    lower.includes('weather') || lower.includes('forecast') || lower.includes('temperature');
  const isYoutube =
    lower.includes('youtube') ||
    lower.includes('video') ||
    lower.includes('watch') ||
    lower.includes('tutorial');
  const isCode =
    lower.includes('github') ||
    lower.includes('code') ||
    lower.includes('repository') ||
    lower.includes('stackoverflow');

  // Build scenario ops
  const ops: Operation[] = [];
  let id = 1;

  const addOp = (
    type: OpType,
    action: string,
    detail: string,
    agent: string,
    url?: string,
    output?: string
  ) => {
    ops.push({
      id: String(id++),
      type,
      action,
      detail,
      status: 'pending',
      agent,
      url,
      duration: Math.floor(Math.random() * 3000) + 800,
      output,
    });
  };

  // PHASE 1: Always start with AI planning
  addOp(
    'ai',
    'Analyzing task intent',
    `Decomposing: "${task.slice(0, 80)}${task.length > 80 ? '...' : ''}"`,
    'PlannerAgent'
  );
  addOp('ai', 'Building execution plan', 'Generating step graph with dependency resolution', 'PlannerAgent');

  // PHASE 2: Browser actions based on task type
  if (isSearch || isNews || isWeather) {
    const query = task.replace(/search|google|find|look up|look for|for me/gi, '').trim();
    addOp(
      'navigate',
      'Opening Google Chrome',
      'Launching sandboxed Chromium instance',
      'BrowserAgent',
      'chrome://newtab'
    );
    addOp(
      'navigate',
      'Navigating to Google',
      'Loading Google Search homepage',
      'BrowserAgent',
      'https://www.google.com'
    );
    addOp('click', 'Focusing search box', 'Clicked on search input field', 'BrowserAgent', 'https://www.google.com');
    addOp(
      'type',
      'Typing search query',
      `Entering: "${query || task.slice(0, 50)}"`,
      'BrowserAgent',
      'https://www.google.com'
    );
    addOp(
      'click',
      'Submitting search',
      'Pressing Enter to execute search',
      'BrowserAgent',
      'https://www.google.com'
    );
    addOp(
      'wait',
      'Loading search results',
      'Waiting for Google SERP to render',
      'BrowserAgent',
      `https://www.google.com/search?q=${encodeURIComponent(query || task.slice(0, 30))}`
    );
    addOp(
      'screenshot',
      'Capturing search results',
      'Taking screenshot of search results page',
      'BrowserAgent',
      `https://www.google.com/search?q=${encodeURIComponent(query || task.slice(0, 30))}`
    );
    addOp(
      'extract',
      'Extracting top results',
      'Parsing titles, URLs, and snippets from top 10 results',
      'ExtractorAgent',
      `https://www.google.com/search?q=${encodeURIComponent(query || task.slice(0, 30))}`,
      'Extracted 10 search results with titles, URLs, meta descriptions'
    );

    if (isNews) {
      addOp(
        'click',
        'Clicking top article',
        'Navigating to first news article',
        'BrowserAgent',
        'https://news.example.com/article'
      );
      addOp(
        'extract',
        'Reading article content',
        'Extracting full article text and metadata',
        'ExtractorAgent',
        'https://news.example.com/article'
      );
      addOp(
        'click',
        'Visiting second article',
        'Navigating to second news source',
        'BrowserAgent',
        'https://news2.example.com/story'
      );
      addOp(
        'extract',
        'Extracting second article',
        'Parsing content from secondary source',
        'ExtractorAgent',
        'https://news2.example.com/story'
      );
    }
  } else if (isShop || isScrape || isCompare) {
    addOp(
      'navigate',
      'Opening Chrome browser',
      'Initializing sandboxed Chromium',
      'BrowserAgent',
      'chrome://newtab'
    );
    addOp(
      'navigate',
      'Navigating to Amazon',
      'Loading Amazon homepage',
      'BrowserAgent',
      'https://www.amazon.com'
    );
    addOp(
      'click',
      'Focusing search field',
      'Clicked Amazon search bar',
      'BrowserAgent',
      'https://www.amazon.com'
    );
    addOp(
      'type',
      'Entering product query',
      `Typing product search terms`,
      'BrowserAgent',
      'https://www.amazon.com'
    );
    addOp(
      'click',
      'Executing search',
      'Clicking search button',
      'BrowserAgent',
      'https://www.amazon.com'
    );
    addOp(
      'wait',
      'Loading product listings',
      'Waiting for search results grid',
      'BrowserAgent',
      'https://www.amazon.com/s?k=product'
    );
    addOp(
      'scroll',
      'Scrolling through results',
      'Loading more product cards via infinite scroll',
      'BrowserAgent',
      'https://www.amazon.com/s?k=product'
    );
    addOp(
      'extract',
      'Scraping product data',
      'Extracting: names, prices, ratings, reviews from 20 products',
      'ExtractorAgent',
      'https://www.amazon.com/s?k=product',
      'Collected 20 products: prices $12.99-$499.99, avg rating 4.3★'
    );
    addOp(
      'screenshot',
      'Capturing results page',
      'Screenshot saved to execution log',
      'BrowserAgent',
      'https://www.amazon.com/s?k=product'
    );

    if (isCompare) {
      addOp(
        'navigate',
        'Opening second site',
        'Navigating to BestBuy for comparison',
        'BrowserAgent',
        'https://www.bestbuy.com'
      );
      addOp(
        'extract',
        'Extracting comparison data',
        'Scraping prices from BestBuy listings',
        'ExtractorAgent',
        'https://www.bestbuy.com/search'
      );
      addOp(
        'ai',
        'Comparing prices',
        'Cross-referencing products across Amazon and BestBuy',
        'PlannerAgent'
      );
    }
  } else if (isEmail) {
    addOp(
      'navigate',
      'Opening Gmail',
      'Navigating to Gmail inbox',
      'BrowserAgent',
      'https://mail.google.com'
    );
    addOp(
      'wait',
      'Authenticating session',
      'Verifying OAuth tokens and logging in',
      'BrowserAgent',
      'https://mail.google.com'
    );
    addOp(
      'click',
      'Composing new email',
      'Clicking Compose button',
      'BrowserAgent',
      'https://mail.google.com'
    );
    addOp(
      'type',
      'Filling email fields',
      'Entering recipient, subject, and body',
      'BrowserAgent',
      'https://mail.google.com'
    );
    addOp(
      'ai',
      'Generating email content',
      'Using AI to compose professional email body',
      'PlannerAgent'
    );
    addOp(
      'click',
      'Sending email',
      'Clicking Send button',
      'BrowserAgent',
      'https://mail.google.com'
    );
  } else if (isSocial) {
    const platform = lower.includes('linkedin')
      ? 'LinkedIn'
      : lower.includes('twitter')
        ? 'Twitter/X'
        : 'Social Platform';
    const url = lower.includes('linkedin')
      ? 'https://www.linkedin.com'
      : lower.includes('twitter')
        ? 'https://x.com'
        : 'https://social.example.com';
    addOp('navigate', `Opening ${platform}`, `Navigating to ${platform}`, 'BrowserAgent', url);
    addOp('wait', 'Authenticating', 'Verifying session credentials', 'BrowserAgent', url);
    addOp('click', 'Creating new post', 'Clicking post/compose button', 'BrowserAgent', url);
    addOp('ai', 'Generating content', 'AI writing engaging post content', 'PlannerAgent');
    addOp('type', 'Writing post content', 'Entering generated content into editor', 'BrowserAgent', url);
    addOp('click', 'Publishing post', 'Clicking Publish/Post button', 'BrowserAgent', url);
  } else if (isYoutube) {
    addOp(
      'navigate',
      'Opening YouTube',
      'Navigating to YouTube',
      'BrowserAgent',
      'https://www.youtube.com'
    );
    addOp(
      'click',
      'Searching videos',
      'Clicking search bar and entering query',
      'BrowserAgent',
      'https://www.youtube.com'
    );
    addOp(
      'type',
      'Entering search term',
      `Typing video search query`,
      'BrowserAgent',
      'https://www.youtube.com'
    );
    addOp(
      'wait',
      'Loading video results',
      'Waiting for YouTube SERP',
      'BrowserAgent',
      'https://www.youtube.com/results'
    );
    addOp(
      'extract',
      'Extracting video data',
      'Parsing video titles, channels, view counts, durations',
      'ExtractorAgent',
      'https://www.youtube.com/results',
      'Found 15 relevant videos, top result: 2.4M views'
    );
  } else if (isCode) {
    addOp(
      'navigate',
      'Opening GitHub',
      'Navigating to GitHub',
      'BrowserAgent',
      'https://github.com'
    );
    addOp('search', 'Searching repositories', 'Querying GitHub search API', 'BrowserAgent', 'https://github.com/search');
    addOp(
      'extract',
      'Extracting repo data',
      'Parsing repository info, stars, forks, languages',
      'ExtractorAgent',
      'https://github.com/search',
      'Found 25 repositories matching criteria'
    );
  } else {
    // Generic task: default to Google search + extraction
    addOp(
      'navigate',
      'Opening Chrome browser',
      'Launching Chromium sandbox',
      'BrowserAgent',
      'chrome://newtab'
    );
    addOp(
      'navigate',
      'Going to Google',
      'Opening Google Search',
      'BrowserAgent',
      'https://www.google.com'
    );
    addOp(
      'type',
      'Entering search query',
      `Searching for: "${task.slice(0, 40)}"`,
      'BrowserAgent',
      'https://www.google.com'
    );
    addOp(
      'click',
      'Searching',
      'Submitting search query',
      'BrowserAgent',
      'https://www.google.com'
    );
    addOp(
      'wait',
      'Loading results',
      'Waiting for page render',
      'BrowserAgent',
      `https://www.google.com/search?q=${encodeURIComponent(task.slice(0, 30))}`
    );
    addOp(
      'extract',
      'Extracting information',
      'Parsing relevant data from search results',
      'ExtractorAgent',
      `https://www.google.com/search?q=${encodeURIComponent(task.slice(0, 30))}`,
      'Extracted relevant data from top 10 results'
    );
    addOp(
      'click',
      'Visiting top result',
      'Navigating to most relevant page',
      'BrowserAgent',
      'https://result.example.com'
    );
    addOp(
      'extract',
      'Reading page content',
      'Extracting detailed content from target page',
      'ExtractorAgent',
      'https://result.example.com'
    );
  }

  // PHASE 3: Always end with AI summary
  addOp(
    'ai',
    'Analyzing collected data',
    'Processing all extracted information through AI model',
    'PlannerAgent'
  );
  addOp(
    'ai',
    'Generating final report',
    'Compiling structured summary with insights and recommendations',
    'PlannerAgent'
  );
  addOp('complete', 'Task completed successfully', 'All operations finished. Results ready.', 'SystemCore');

  return ops;
}

/* ===========================================================
   PROGRESS RING COMPONENT
=========================================================== */

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

/* ===========================================================
   SIMULATED BROWSER CONTENT
=========================================================== */

function LiveBrowserViewport({ frame }: { frame: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!frame || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = frame.width;
      canvas.height = frame.height;
      ctx.drawImage(img, 0, 0);

      // Draw highlighted element if available
      if (frame.highlightedElement) {
        const { x, y, width, height } = frame.highlightedElement;
        ctx.strokeStyle = '#ef4444'; // OmniTask red
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(x, y, width, height);
      }

      // Draw custom cursor if available
      if (frame.cursorPosition) {
        const { x, y } = frame.cursorPosition;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.fill();
      }
    };
    img.src = `data:image/jpeg;base64,${frame.base64}`;
  }, [frame]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-[500px] object-contain rounded-lg border border-white/10 shadow-2xl"
      />
    </div>
  );
}

function BrowserSimContent({
  ops,
  currentIndex,
  phase,
  latestFrame,
  task,
  simulatedCursor,
}: {
  ops: Operation[];
  currentIndex: number;
  phase: ExecutionPhase;
  latestFrame: any;
  task: string;
  simulatedCursor: { x: number; y: number; visible: boolean; text: string };
}) {
  const [typedText, setTypedText] = useState('');
  const currentOp = currentIndex >= 0 && currentIndex < ops.length ? ops[currentIndex] : null;

  // Typewriter effect synced to typing operations
  useEffect(() => {
    if (!currentOp || currentOp.type !== 'type') {
      setTypedText('');
      return;
    }

    let target = '';
    const match = currentOp.detail.match(/"([^"]+)"/);
    if (match) {
      target = match[1];
    } else {
      target = task.replace(/search|google|find|look up|look for|for me|compare|versus|vs/gi, '').trim();
    }
    if (!target) target = 'AI automation trends in 2026';
    if (target.length > 50) target = target.slice(0, 50) + '...';

    let index = 0;
    setTypedText('');
    const timer = setInterval(() => {
      if (index < target.length) {
        setTypedText((prev) => prev + target[index]);
        index++;
      } else {
        clearInterval(timer);
      }
    }, 30);

    return () => clearInterval(timer);
  }, [currentIndex, currentOp, task]);

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center px-8 relative">
        <div className="absolute inset-0 cyber-grid opacity-5" />
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-white/[0.05] bg-white/[0.01] mb-6 shadow-2xl relative z-10 hover:border-red-500/20 hover:bg-red-500/[0.01] transition-all">
          <Monitor className="h-10 w-10 text-zinc-600 animate-pulse" />
        </div>
        <h3 className="text-lg font-bold text-zinc-400 mb-2 relative z-10">Chrome Browser Sandbox</h3>
        <p className="text-xs text-zinc-600 max-w-sm leading-relaxed relative z-10">
          State-of-the-art autonomous runtime. Describe your workflow in the HUD console above to deploy AI agents inside this Chromium container.
        </p>
      </div>
    );
  }

  if (phase === 'planning') {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center px-8 relative">
        <div className="browser-scanline" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
          className="flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 mb-6 red-glow"
        >
          <BrainCircuit className="h-9 w-9 text-red-400" />
        </motion.div>
        <h3 className="text-base font-bold text-white mb-2 font-mono tracking-wide">
          PlannerAgent: Constructing Graph
          <span className="typing-cursor" />
        </h3>
        <p className="text-xs text-zinc-500 max-w-xs font-mono">Decomposing intent into optimal execution paths...</p>
      </div>
    );
  }

  if (latestFrame && latestFrame.base64) {
    return <LiveBrowserViewport frame={latestFrame} />;
  }

  /* ===========================================================
     HIGH FIDELITY MOCK PAGE SELECTOR
  =========================================================== */
  const lower = task.toLowerCase();
  const isSearch = lower.includes('search') || lower.includes('google') || lower.includes('find') || lower.includes('look up') || lower.includes('look for');
  const isScrape = lower.includes('scrape') || lower.includes('extract') || lower.includes('get data') || lower.includes('collect');
  const isCompare = lower.includes('compare') || lower.includes('vs') || lower.includes('versus') || lower.includes('difference');
  const isEmail = lower.includes('email') || lower.includes('gmail') || lower.includes('send mail') || lower.includes('mail');
  const isSocial = lower.includes('linkedin') || lower.includes('twitter') || lower.includes('facebook') || lower.includes('instagram') || lower.includes('post');
  const isShop = lower.includes('amazon') || lower.includes('buy') || lower.includes('price') || lower.includes('shop') || lower.includes('product');
  const isYoutube = lower.includes('youtube') || lower.includes('video') || lower.includes('watch') || lower.includes('tutorial');
  const isCode = lower.includes('github') || lower.includes('code') || lower.includes('repository') || lower.includes('stackoverflow');

  const query = task.replace(/search|google|find|look up|look for|for me|compare|versus|vs/gi, '').trim() || 'AI tech developments';

  // State-based triggers for simulated page transitions
  const isInitialGoogle = (isSearch || isYoutube || isCode || isScrape || isCompare) && currentIndex <= 2;
  const isGoogleSERP = (isSearch || isYoutube || isCode || isScrape || isCompare) && currentIndex > 2 && currentIndex <= 7 && !isCompare && !isShop;
  const isAmazonCompare = (isCompare || isShop || isScrape) && currentIndex > 2;
  const isGmailCompose = isEmail && currentIndex >= 2;
  const isLinkedInFeed = isSocial && currentIndex >= 2;
  const isYoutubeGrid = isYoutube && currentIndex >= 3;
  const isGitHubRepo = isCode && currentIndex >= 2;

  // Helper for highlights
  const isTyping = currentOp?.type === 'type';
  const isClicking = currentOp?.type === 'click';
  const isExtracting = currentOp?.type === 'extract';

  return (
    <div className="mock-browser-canvas animate-fade-in text-zinc-300">
      {/* 1. MOCK GOOGLE HOMEPAGE */}
      {isInitialGoogle && (
        <div className="flex flex-col items-center justify-center h-full min-h-[380px] w-full px-6">
          <div className="google-logo-neon mb-8 flex gap-1 font-black">
            <span className="text-blue-500">G</span>
            <span className="text-red-500">o</span>
            <span className="text-yellow-500">o</span>
            <span className="text-blue-500">g</span>
            <span className="text-green-500">l</span>
            <span className="text-red-500">e</span>
          </div>

          <div className={cn(
            "w-full max-w-xl flex items-center gap-3 px-4 py-3 rounded-full bg-white/[0.03] border transition-all duration-300",
            isTyping ? "border-red-500/50 bg-red-500/[0.01] shadow-[0_0_20px_rgba(239,68,68,0.06)]" : "border-white/10"
          )}>
            <Search className="h-4 w-4 text-zinc-600 flex-shrink-0" />
            <div className="flex-1 text-sm text-left truncate font-medium text-white font-mono cursor-typing-effect">
              {isTyping ? typedText : ''}
            </div>
            {isTyping && (
              <div className="text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-mono uppercase">
                TYPING...
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button className={cn(
              "px-4 py-2 rounded-xl text-xs font-semibold bg-white/[0.02] border border-white/[0.05] transition-all hover:bg-white/[0.04] text-zinc-500",
              isClicking && currentOp?.action.includes('Submit') && "border-red-500/40 bg-red-500/5 text-red-400 glow-selector-boundary"
            )}>
              Google Search
            </button>
            <button className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/[0.02] border border-white/[0.05] text-zinc-500">
              I'm Feeling Lucky
            </button>
          </div>
        </div>
      )}

      {/* 2. MOCK GOOGLE SEARCH RESULTS */}
      {isGoogleSERP && (
        <div className="h-full w-full p-4 space-y-4">
          {/* SERP Search header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-4 flex-1">
              <span className="font-extrabold text-sm tracking-tight text-white mr-2">G<span className="text-red-500">o</span>o</span>
              <div className="max-w-md flex-1 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-xs">
                <Search className="h-3 w-3 text-zinc-600" />
                <span className="text-zinc-300 font-mono font-medium truncate">{query}</span>
              </div>
            </div>
          </div>

          {/* Results list */}
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
            {[
              {
                title: `Latest Breakthroughs in ${query} - TechDigest`,
                url: `https://techdigest.com/${query.replace(/\s+/g, '-')}`,
                desc: `Discover the most detailed review, expert consensus, and strategic challenges regarding ${query}. Leading experts lay out the key variables for 2026.`
              },
              {
                title: `Everything you need to know about ${query}`,
                url: `https://wikipedia.org/wiki/${query.replace(/\s+/g, '_')}`,
                desc: `${query} represents a dynamic field of modern technology. Read our extensive encyclopedia entries covering background context, timelines, and systems.`
              },
              {
                title: `Top 10 trends for ${query} in 2026`,
                url: `https://businessinsider.com/reports/${query.replace(/\s+/g, '-')}`,
                desc: `Check out our industry analysts' whitepaper outlining massive commercial tailwinds and paradigm shifts taking place inside ${query} sectors.`
              }
            ].map((res, i) => {
              const isTargeted = isExtracting && i === 0;
              const isClicked = isClicking && currentOp?.action.includes('Click') && i === 0;

              return (
                <div
                  key={i}
                  className={cn(
                    "p-3 rounded-2xl border border-transparent transition-all",
                    isTargeted && "glow-selector-boundary bg-emerald-500/[0.01]",
                    isClicked && "glow-selector-boundary bg-red-500/[0.01]"
                  )}
                >
                  {isTargeted && (
                    <span className="selector-highlight-label">
                      <Cpu className="h-2.5 w-2.5 animate-spin" />
                      EXTRACTING SELECTOR: .g:nth-child(1)
                    </span>
                  )}
                  {isClicked && (
                    <span className="selector-highlight-label bg-red-500 text-white">
                      <MousePointerClick className="h-2.5 w-2.5" />
                      CLICKING TARGET
                    </span>
                  )}
                  <a href="#" className="text-xs text-blue-400 hover:underline block font-mono truncate mb-1">{res.url}</a>
                  <h4 className="text-sm font-bold text-white hover:text-blue-300 transition-colors cursor-pointer truncate">{res.title}</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed mt-1">{res.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. MOCK E-COMMERCE PRICE COMPARISON */}
      {isAmazonCompare && (
        <div className="h-full w-full p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <span className="font-extrabold text-sm tracking-tight text-white">OmniCompare Storefront</span>
            <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
              ANALYZING VALUE DELTAS
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Amazon card */}
            <div className={cn(
              "comparison-card",
              isExtracting && currentOp?.action.includes('Amazon') && "glow-selector-boundary"
            )}>
              {isExtracting && currentOp?.action.includes('Amazon') && (
                <span className="selector-highlight-label bg-emerald-500">
                  <Cpu className="h-2.5 w-2.5" />
                  Scraping Amazon
                </span>
              )}
              <div className="h-20 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-center justify-center mb-3">
                <Globe className="h-6 w-6 text-zinc-700" />
              </div>
              <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">AMAZON</p>
              <h4 className="text-xs font-bold text-white truncate mt-1">Apple {query.slice(0,25)}</h4>
              <p className="text-sm font-extrabold text-white mt-1.5">$1,099.00</p>
              <div className="flex items-center gap-1 mt-1 text-[9px] text-zinc-500">
                <span>4.8 ★</span>
                <span>(12k reviews)</span>
              </div>
            </div>

            {/* Best Buy card */}
            <div className={cn(
              "comparison-card",
              isCompare && "highlighted",
              isExtracting && currentOp?.action.includes('BestBuy') && "glow-selector-boundary"
            )}>
              {isExtracting && currentOp?.action.includes('BestBuy') && (
                <span className="selector-highlight-label bg-emerald-500">
                  <Cpu className="h-2.5 w-2.5" />
                  Scraping BestBuy
                </span>
              )}
              <div className="h-20 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-center justify-center mb-3">
                <Globe className="h-6 w-6 text-zinc-700" />
              </div>
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">BEST BUY</p>
              <h4 className="text-xs font-bold text-white truncate mt-1">Apple {query.slice(0,25)} - Unlocked</h4>
              <p className="text-sm font-extrabold text-emerald-400 mt-1.5">$1,079.99</p>
              <div className="flex items-center gap-1 mt-1 text-[9px] text-zinc-500">
                <span>4.9 ★</span>
                <span>(3.1k reviews)</span>
              </div>
            </div>
          </div>

          {/* Value Graph */}
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-zinc-500">Price Variance Delta</span>
              <span className="text-[10px] font-mono font-bold text-emerald-400">-$19.01 (Cheaper)</span>
            </div>
            <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden flex">
              <div className="h-full bg-orange-400" style={{ width: '51%' }} />
              <div className="h-full bg-emerald-400" style={{ width: '49%' }} />
            </div>
          </div>
        </div>
      )}

      {/* 4. MOCK GMAIL / EMAIL COMPOSER */}
      {isGmailCompose && (
        <div className="h-full w-full p-4 relative flex flex-col justify-end min-h-[360px]">
          {/* Background Inbox Mockup */}
          <div className="absolute inset-x-4 top-4 bottom-24 bg-white/[0.01] border border-white/[0.05] rounded-2xl p-4 opacity-25 select-none pointer-events-none">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-3">
              <span className="text-xs font-bold text-zinc-600">Gmail Workspace</span>
              <span className="text-[10px] text-zinc-700">Inbox (12)</span>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-white/[0.05] rounded w-full" />
              <div className="h-4 bg-white/[0.05] rounded w-5/6" />
              <div className="h-4 bg-white/[0.05] rounded w-full" />
            </div>
          </div>

          {/* Email Compose Overlay */}
          <div className="email-compose-popup mx-auto w-full relative z-20">
            <div className="email-compose-header">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                New Message (OmniTask AI Draft)
              </span>
              <div className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-zinc-700" />
                <span className="h-2 w-2 rounded-full bg-zinc-700" />
                <span className="h-2 w-2 rounded-full bg-zinc-700" />
              </div>
            </div>

            <div className="p-4 space-y-3 font-mono text-[11px]">
              <div className="flex border-b border-white/[0.06] pb-2">
                <span className="text-zinc-600 w-16">To:</span>
                <span className="text-zinc-300">client@enterprise.com</span>
              </div>
              <div className="flex border-b border-white/[0.06] pb-2">
                <span className="text-zinc-600 w-16">Subject:</span>
                <span className="text-zinc-300 font-bold text-red-400 truncate">Automated Pricing Intelligence Summary</span>
              </div>
              <div className="min-h-[100px] text-left leading-relaxed text-zinc-400 text-xs py-1 whitespace-pre-wrap select-all cursor-typing-effect">
                {isTyping ? typedText : 'Dear Client,\n\nWe have successfully executed the autonomous pricing comparison audit. The details are ready for your review...'}
              </div>

              {/* Footer send controls */}
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 mt-3">
                <button className={cn(
                  "glow-btn px-5 py-2 rounded-xl bg-blue-500 text-white font-bold text-xs flex items-center gap-2",
                  isClicking && currentOp?.action.includes('Send') && "bg-red-500 ring-2 ring-red-500/30"
                )}>
                  <Send className="h-3.5 w-3.5" />
                  Send Draft
                </button>
                <span className="text-[9px] text-zinc-600">Secure AES Endpoint</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MOCK LINKEDIN FEED */}
      {isLinkedInFeed && (
        <div className="h-full w-full p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <span className="font-extrabold text-sm tracking-tight text-white flex items-center gap-2">
              <span className="bg-blue-500 text-black px-1.5 py-0.5 rounded font-black text-xs">in</span>
              LinkedIn Sandbox
            </span>
          </div>

          <div className="linkedin-post-card relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center font-bold text-sm">
                ND
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Noupa Dasankar</h4>
                <p className="text-[9px] text-zinc-500 font-mono">Senior Automation Architect • Just now</p>
              </div>
            </div>

            <div className="text-xs text-left leading-relaxed text-zinc-300 font-mono py-2 min-h-[80px] cursor-typing-effect">
              {isTyping ? typedText : '🚀 Executed fully autonomous browser automations across e-commerce platforms. Built with state of the art agents running planning cycles and executing details in real-time. #AI #PlatformEngineering'}
            </div>

            <div className="linkedin-reaction-bar">
              <span className="flex items-center gap-1 cursor-pointer hover:text-white"><ThumbsUp className="h-3 w-3" /> Like</span>
              <span className="flex items-center gap-1 cursor-pointer hover:text-white"><MessageSquare className="h-3 w-3" /> Comment</span>
              <span className="flex items-center gap-1 cursor-pointer hover:text-white"><Share2 className="h-3 w-3" /> Share</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. MOCK YOUTUBE RESEARCH GRID */}
      {isYoutubeGrid && (
        <div className="h-full w-full p-4 space-y-4">
          <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
            <div className="h-6 w-6 rounded bg-red-500 flex items-center justify-center text-white">
              <Play className="h-3 w-3 fill-current" />
            </div>
            <span className="font-extrabold text-sm text-white">YouTube Library</span>
          </div>

          <div className="grid grid-cols-3 gap-3 max-h-[280px] overflow-y-auto">
            {[
              { title: `${query} Master Class 2026`, channel: 'TechAcademy', views: '1.2M views', dur: '45:12' },
              { title: `Why ${query} is revolutionary`, channel: 'FutureLab', views: '980k views', dur: '12:05' },
              { title: `Complete roadmap for ${query}`, channel: 'DevSchool', views: '450k views', dur: '1:24:00' }
            ].map((vid, i) => {
              const isTargeted = isExtracting && i === 0;

              return (
                <div
                  key={i}
                  className={cn(
                    "bg-white/[0.01] border border-white/[0.04] rounded-xl p-2 transition-all relative",
                    isTargeted && "glow-selector-boundary bg-emerald-500/[0.01]"
                  )}
                >
                  {isTargeted && (
                    <span className="selector-highlight-label">
                      <Cpu className="h-2 w-2" />
                      EXTRACT
                    </span>
                  )}
                  <div className="aspect-video bg-white/[0.02] border border-white/[0.06] rounded-lg mb-2 relative flex items-center justify-center">
                    <Play className="h-6 w-6 text-zinc-700" />
                    <span className="absolute bottom-1 right-1 bg-black text-[8px] font-bold px-1 rounded font-mono">{vid.dur}</span>
                  </div>
                  <h5 className="text-[10px] font-bold text-white truncate">{vid.title}</h5>
                  <p className="text-[9px] text-zinc-500 truncate mt-0.5">{vid.channel}</p>
                  <p className="text-[8px] text-zinc-600 mt-0.5">{vid.views}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7. MOCK GITHUB REPOSITORY */}
      {isGitHubRepo && (
        <div className="h-full w-full p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <span className="font-extrabold text-xs tracking-tight text-white flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-zinc-500" />
              github.com / noupadasankar / omnitask-ai
            </span>
            <div className="flex gap-2">
              <span className="text-[9px] font-mono bg-zinc-800 text-zinc-300 border border-white/10 px-2 py-0.5 rounded flex items-center gap-1">
                ★ 1,248
              </span>
            </div>
          </div>

          <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20 text-[10px] font-mono max-h-[260px] overflow-y-auto">
            <div className="bg-white/[0.02] border-b border-white/[0.06] px-3 py-2 flex items-center justify-between text-zinc-500">
              <span>Commit message</span>
              <span>Age</span>
            </div>
            {[
              { path: 'apps/frontend/src/app/', msg: 'feat: premium glassmorphic control HUD deck', time: '2 mins ago' },
              { path: 'apps/backend/src/planning/', msg: 'opt: enhance PlannerAgent cycle parameters', time: '1 hour ago' },
              { path: 'package.json', msg: 'release: v1.0.0 stable autonomous runtime', time: '1 day ago' },
              { path: 'tsconfig.json', msg: 'config: strict type compilation validation rules', time: '3 days ago' }
            ].map((f, i) => {
              const isTargeted = isExtracting && i === 0;

              return (
                <div
                  key={i}
                  className={cn(
                    "px-3 py-2 flex items-center justify-between border-b border-white/[0.04] transition-all relative",
                    isTargeted && "glow-selector-boundary bg-emerald-500/[0.01]"
                  )}
                >
                  {isTargeted && (
                    <span className="selector-highlight-label">
                      <Cpu className="h-2 w-2" />
                      READING FILES
                    </span>
                  )}
                  <span className="text-zinc-300 font-semibold truncate max-w-[120px]">{f.path}</span>
                  <span className="text-zinc-500 truncate flex-1 ml-4 mr-2">{f.msg}</span>
                  <span className="text-zinc-600">{f.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 8. DEFAULT FALLBACK SCRAIPING GRAPH VISUALIZER */}
      {!isInitialGoogle && !isGoogleSERP && !isAmazonCompare && !isGmailCompose && !isLinkedInFeed && !isYoutubeGrid && !isGitHubRepo && (
        <div className="h-full w-full p-4 relative flex flex-col justify-between min-h-[360px]">
          {/* HUD Status Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <span className="font-mono text-[10px] text-zinc-500 flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-red-400 animate-pulse" />
              INTELLIGENT SCRAPER RUNTIME
            </span>
            <span className="text-[9px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded uppercase">
              ACTIVE NODE GRAPH
            </span>
          </div>

          {/* Centralized Node Graph Illustration */}
          <div className="relative flex-1 flex items-center justify-center py-6 min-h-[160px]">
            {/* Center Core Node */}
            <div className="network-node absolute z-20 bg-red-500/10">
              <Cpu className="h-5 w-5 text-red-400 animate-pulse" />
            </div>

            {/* Dotted network links */}
            <div className="network-line" style={{ width: '90px', transform: 'rotate(30deg) translateX(10px)' }} />
            <div className="network-line" style={{ width: '90px', transform: 'rotate(150deg) translateX(10px)' }} />
            <div className="network-line" style={{ width: '90px', transform: 'rotate(270deg) translateX(10px)' }} />

            {/* Satellite Server Nodes */}
            <div className="network-node absolute bg-blue-500/10 border-blue-500" style={{ transform: 'translate(80px, 45px)' }}>
              <Globe className="h-3 w-3 text-blue-400" />
            </div>
            <div className="network-node absolute bg-purple-500/10 border-purple-500" style={{ transform: 'translate(-80px, 45px)' }}>
              <Search className="h-3 w-3 text-purple-400" />
            </div>
            <div className="network-node absolute bg-emerald-500/10 border-emerald-500" style={{ transform: 'translate(0px, -90px)' }}>
              <FileText className="h-3 w-3 text-emerald-400" />
            </div>

            {/* Floating Data Particles */}
            {isExtracting && (
              <>
                <div className="data-particle" style={{ animationDelay: '0.2s', left: '60%', top: '70%' }} />
                <div className="data-particle" style={{ animationDelay: '0.6s', left: '35%', top: '70%' }} />
                <div className="data-particle" style={{ animationDelay: '1s', left: '50%', top: '20%' }} />
              </>
            )}
          </div>

          {/* Running Terminal log output */}
          <div className="border border-white/[0.06] rounded-xl bg-black/40 p-3 font-mono text-[9px] text-zinc-500 text-left space-y-1 max-h-[100px] overflow-y-auto relative z-20">
            <div>[SystemCore] Initializing sandboxed execution engine...</div>
            <div>[PlannerAgent] Resolving goal: "{query}"</div>
            <div className={cn(isTyping && "text-red-400")}>[BrowserAgent] Active Step: {currentOp?.action || 'idle wait cycle'}</div>
            <div className={cn(isExtracting && "text-emerald-400")}>[ExtractorAgent] Output Status: {currentOp?.detail || 'listening...'}</div>
            {phase === 'completed' && <div className="text-emerald-400 font-bold">[SystemCore] EXECUTION COMPLETED SUCCESSFULLY. READY.</div>}
          </div>
        </div>
      )}
      {/* Simulated Mouse Cursor Overlay */}
      {simulatedCursor && simulatedCursor.visible && (
        <motion.div
          animate={{ x: simulatedCursor.x, y: simulatedCursor.y }}
          transition={{ type: 'spring', damping: 28, stiffness: 130 }}
          className="absolute pointer-events-none z-50 flex flex-col items-start"
          style={{ left: 0, top: 0 }}
        >
          <MousePointerClick className="h-4 w-4 text-red-500 fill-current filter drop-shadow-[0_2px_8px_rgba(239,68,68,0.5)]" />
          {simulatedCursor.text && (
            <div className="mt-1 bg-red-500/90 border border-red-500/20 text-white font-mono text-[8px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
              {simulatedCursor.text}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

/* ===========================================================
   COGNITIVE INTELLIGENCE MODULES (AI Thought & Cursor Orchestration)
=========================================================== */

function getThoughtForStep(op: Operation, task: string, stepIdx: number, totalSteps: number): string {
  const query = task.replace(/search|google|find|look up|look for|for me|compare|versus|vs/gi, '').trim() || 'AI agent trends';
  
  if (op.type === 'ai') {
    if (stepIdx === 0) {
      return `[PlannerAgent] Cognitive Analysis: Initiating task decomposition for target goal: "${task}". Parsing operational tokens... I will partition this automation workflow into planning steps, browser-based Chromium navigation, selective HTML extraction cycles, and synthesis report packaging.`;
    }
    if (stepIdx === 1) {
      return `[PlannerAgent] Strategic Formulation: Constructing execution step graph. Located dependency boundaries. I have resolved that a live Google/Chrome sandboxed instance is required to fetch real-time data nodes.`;
    }
    if (op.action.includes('Comparing')) {
      return `[PlannerAgent] Multi-source Synthesis: Cross-referencing retrieved price metrics. Amazon has baseline listings for '${query}' at $1,099.00, whereas Best Buy is offering a matching unlocked model at $1,079.99. Best Buy is $19.01 cheaper.`;
    }
    return `[PlannerAgent] Synthesis Engine: Aggregating all parsed datasets. Commencing semantic analysis and layout construction to build an optimal markdown final report.`;
  }
  
  if (op.type === 'navigate') {
    if (op.url?.includes('google.com')) {
      return `[BrowserAgent] Navigation Request: Directing Chromium thread to 'google.com'. Checking proxy status... Security handshake verified. Loading search gateway page...`;
    }
    if (op.url?.includes('amazon.com')) {
      return `[BrowserAgent] Target Redirection: Directing sandboxed browser instance to Amazon homepage. Scanning viewport grids... Bypassing potential bot-protection cookies.`;
    }
    if (op.url?.includes('mail.google.com')) {
      return `[BrowserAgent] Redirection: Loading secure Gmail mail client frame. Verifying active OAuth user session tokens and caching authorization cookies.`;
    }
    if (op.url?.includes('linkedin.com')) {
      return `[BrowserAgent] Navigation: Directing to LinkedIn timeline dashboard feed. Located user session parameters. Establishing live viewport rendering socket.`;
    }
    return `[BrowserAgent] Transition: Spawning new sandboxed Chromium page. Initializing clean tab environment at address: ${op.url || 'about:blank'}`;
  }
  
  if (op.type === 'type') {
    return `[BrowserAgent] Input Injection: Located active text box coordinates. Injecting synthetic keydown events for text query: "${query}". Emulating natural human typing speed delays to stay completely undetected.`;
  }
  
  if (op.type === 'click') {
    return `[BrowserAgent] Element Interaction: Querying DOM node at selector path. Located target button element. Dispatching synthetic pointer click event.`;
  }
  
  if (op.type === 'wait') {
    return `[SystemCore] State Sync: Pausing execution. Waiting for page resources to load completely. Network idle threshold met. Document Object Model ready for querying.`;
  }
  
  if (op.type === 'extract') {
    return `[ExtractorAgent] DOM Parsing: Executing script query against page tree. Scraping titles, text contents, prices, and stats. Bounding box selector targets successfully extracted. Writing parsed JSON payload into operational context cache.`;
  }
  
  if (op.type === 'screenshot') {
    return `[BrowserAgent] Viewport Capture: Extracting high-resolution screenshot frame buffer from graphics rendering engine. Compressing base64 stream and saving snapshot directly into secure task log repository.`;
  }
  
  if (op.type === 'complete') {
    return `[SystemCore] Goal Achieved: All operational parameters successfully resolved. Verification criteria met. Deallocating sandboxed Chromium process resources. Compilation finished. Results outputted.`;
  }
  
  return `[AgentCore] Thinking: Commencing next step "${op.action}". Parsing environment tree variables and executing targeted browser hooks...`;
}

function getCursorCoordinatesForStep(op: Operation, task: string, idx: number) {
  const lower = task.toLowerCase();
  const isCompare = lower.includes('compare') || lower.includes('vs') || lower.includes('versus') || lower.includes('difference') || lower.includes('amazon') || lower.includes('buy') || lower.includes('price') || lower.includes('shop') || lower.includes('product');
  const isEmail = lower.includes('email') || lower.includes('gmail') || lower.includes('send mail') || lower.includes('mail');
  const isSocial = lower.includes('linkedin') || lower.includes('twitter') || lower.includes('facebook') || lower.includes('instagram') || lower.includes('post');
  
  if (idx <= 1) return { x: 0, y: 0, visible: false, text: '' };
  
  if (op.type === 'navigate') {
    return { x: 250, y: 40, visible: true, text: `Navigating URL` };
  }
  
  if (op.type === 'click') {
    if (op.action.includes('search box') || op.action.includes('search field') || op.action.includes('search input')) {
      return { x: 280, y: 200, visible: true, text: 'Clicking search bar' };
    }
    if (op.action.includes('Submitting search') || op.action.includes('Executing search') || op.action.includes('Searching')) {
      return { x: 420, y: 260, visible: true, text: 'Clicking Search' };
    }
    if (op.action.includes('Composing') || op.action.includes('Compose')) {
      return { x: 120, y: 150, visible: true, text: 'Clicking Compose' };
    }
    if (op.action.includes('Sending') || op.action.includes('Send')) {
      return { x: 380, y: 430, visible: true, text: 'Clicking Send' };
    }
    if (op.action.includes('Creating new post') || op.action.includes('Create post')) {
      return { x: 320, y: 180, visible: true, text: 'Opening post editor' };
    }
    if (op.action.includes('Publishing') || op.action.includes('Publish') || op.action.includes('Post')) {
      return { x: 620, y: 390, visible: true, text: 'Clicking Publish' };
    }
    return { x: 400, y: 220, visible: true, text: 'Hovering element' };
  }
  
  if (op.type === 'type') {
    if (isEmail) return { x: 450, y: 320, visible: true, text: 'Typing email draft...' };
    if (isSocial) return { x: 500, y: 280, visible: true, text: 'Typing LinkedIn post...' };
    return { x: 280, y: 200, visible: true, text: 'Typing query...' };
  }
  
  if (op.type === 'extract') {
    if (isCompare) {
      if (op.action.includes('Amazon')) return { x: 220, y: 220, visible: true, text: 'Scraping Amazon pricing' };
      if (op.action.includes('BestBuy')) return { x: 720, y: 220, visible: true, text: 'Scraping Best Buy pricing' };
      return { x: 480, y: 350, visible: true, text: 'Comparing pricing models' };
    }
    return { x: 250, y: 180, visible: true, text: 'Extracting page contents' };
  }
  
  if (op.type === 'screenshot') {
    return { x: 640, y: 360, visible: true, text: 'Capturing viewport screenshot' };
  }
  
  if (op.type === 'complete') {
    return { x: 0, y: 0, visible: false, text: '' };
  }
  
  return { x: 300, y: 200, visible: true, text: 'Executing browser operation' };
}

/* ===========================================================
   MAIN DASHBOARD PAGE
=========================================================== */

export default function DashboardPage() {
  const { user } = useAuth();
  const {
    isConnected,
    latestFrame,
    executionEvents,
    pendingApproval,
    logs: socketLogs,
    sendApprovalResponse,
    pauseSession,
    resumeSession,
    cancelSession,
    joinSession,
    leaveSession,
  } = useSocket();

  const [task, setTask] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ExecutionPhase>('idle');
  const [operations, setOperations] = useState<Operation[]>([]);
  const [currentOpIndex, setCurrentOpIndex] = useState(-1);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [taskHistory, setTaskHistory] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'timeline' | 'logs' | 'thoughts' | 'profile' | 'skills'>('thoughts');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simLogs, setSimLogs] = useState<Array<{ level: string; message: string; timestamp: number }>>([]);
  const [simulatedCursor, setSimulatedCursor] = useState<{ x: number; y: number; visible: boolean; text: string }>({ x: 0, y: 0, visible: false, text: '' });
  const [currentStreamingThought, setCurrentStreamingThought] = useState('');
  const [thoughtsHistory, setThoughtsHistory] = useState<Array<{ agent: string; text: string; timestamp: number }>>([]);

  // User Profile Memory States
  const [profile, setProfile] = useState<any>({
    name: '',
    email: '',
    phone: '',
    addresses: [],
    paymentPreferences: {},
    resumes: [],
    favoriteSites: []
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newSite, setNewSite] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Skill definitions from registry
  const [skills, setSkills] = useState<any[]>([]);

  // Load profile and skills on mount
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
            favoriteSites: card.favoriteSites || []
          });
        }
        const skillsList = await listSkills();
        if (skillsList) {
          setSkills(skillsList);
        }
      } catch (err) {
        console.error('Failed to load profile memory or skill definition:', err);
      } finally {
        setProfileLoading(false);
      }
    }
    loadData();
  }, []);

  const addAddress = () => {
    if (!newAddress.trim()) return;
    setProfile((prev: any) => ({
      ...prev,
      addresses: [...prev.addresses, newAddress.trim()]
    }));
    setNewAddress('');
  };

  const removeAddress = (idx: number) => {
    setProfile((prev: any) => ({
      ...prev,
      addresses: prev.addresses.filter((_: any, i: number) => i !== idx)
    }));
  };

  const addFavoriteSite = () => {
    if (!newSite.trim()) return;
    setProfile((prev: any) => ({
      ...prev,
      favoriteSites: [...prev.favoriteSites, newSite.trim()]
    }));
    setNewSite('');
  };

  const removeFavoriteSite = (idx: number) => {
    setProfile((prev: any) => ({
      ...prev,
      favoriteSites: prev.favoriteSites.filter((_: any, i: number) => i !== idx)
    }));
  };

  const saveProfileCard = async () => {
    setSavingProfile(true);
    try {
      await saveUserProfileCard(profile);
    } catch (err: any) {
      console.error('Failed to save profile memory:', err);
    } finally {
      setSavingProfile(false);
    }
  };

  const logContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const simTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simAbortRef = useRef(false);

  // Timer for elapsed time
  useEffect(() => {
    if (phase === 'executing' || phase === 'planning') {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 100);
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // Auto-scroll log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [currentOpIndex, socketLogs.length, activeTab]);

  // Join/leave session room
  useEffect(() => {
    if (!sessionId || !user?.id) return;
    joinSession(sessionId, user.id);
    return () => {
      leaveSession(sessionId);
    };
  }, [sessionId, user?.id, joinSession, leaveSession]);

  const fetchSteps = useCallback(async (sid: string) => {
    try {
      const data = await getAgentSessionSteps(sid);
      const steps = data.steps || [];
      const mappedOps = steps.map((step: any) => {
        let type: OpType = 'wait';
        const act = String(step.action).toLowerCase();
        if (act === 'navigate') type = 'navigate';
        else if (act.includes('click')) type = 'click';
        else if (act === 'type') type = 'type';
        else if (act === 'scroll') type = 'scroll';
        else if (act === 'hover') type = 'click';
        else if (act === 'screenshot') type = 'screenshot';
        else if (act.includes('extract')) type = 'extract';
        else if (act === 'wait') type = 'wait';
        else type = 'ai';

        return {
          id: String(step.index),
          type,
          action: step.description || `${step.action} step`,
          detail: `${step.action.toUpperCase()}${step.target ? ` on ${step.target}` : ''}${step.value ? ` to ${step.value}` : ''}`,
          status: 'pending' as OpStatus,
          agent: step.action === 'evaluate' || step.action === 'solve_captcha' ? 'PlannerAgent' : 'BrowserAgent',
          url: step.action === 'navigate' ? step.value : undefined,
        };
      });
      setOperations(mappedOps);
      setCurrentOpIndex(data.currentStepIndex || 0);
    } catch (err) {
      console.error('Error fetching session steps:', err);
    }
  }, []);

  // Listen to WebSocket events to update UI state
  useEffect(() => {
    if (!sessionId || executionEvents.length === 0) return;

    const latestEvent = executionEvents[executionEvents.length - 1];
    const data = latestEvent.data;

    if (latestEvent.type === 'plan:created') {
      fetchSteps(sessionId);
      setPhase('executing');
    } else if (latestEvent.type === 'plan:replanned') {
      fetchSteps(sessionId);
    } else if (latestEvent.type === 'step:started') {
      const idx = data.stepIndex;
      setOperations((prev) =>
        prev.map((op, i) => (i === idx ? { ...op, status: 'running' as OpStatus } : op))
      );
      setCurrentOpIndex(idx);
    } else if (latestEvent.type === 'step:completed') {
      const idx = data.stepIndex;
      setOperations((prev) =>
        prev.map((op, i) => (i === idx ? { ...op, status: 'completed' as OpStatus, duration: data.duration } : op))
      );
    } else if (latestEvent.type === 'step:failed' || latestEvent.type === 'step:blocked' || latestEvent.type === 'step:denied') {
      const idx = data.stepIndex;
      setOperations((prev) =>
        prev.map((op, i) => (i === idx ? { ...op, status: 'failed' as OpStatus } : op))
      );
    } else if (latestEvent.type === 'session:started') {
      setPhase('executing');
    } else if (latestEvent.type === 'execution:completed') {
      setPhase('completed');
    } else if (latestEvent.type === 'execution:failed') {
      setPhase('failed');
    } else if (latestEvent.type === 'execution:paused') {
      setPhase('paused');
    } else if (latestEvent.type === 'execution:resumed') {
      setPhase('executing');
    } else if (latestEvent.type === 'execution:cancelled') {
      setPhase('failed');
    }
  }, [executionEvents, sessionId, fetchSteps]);

  /* ===========================================================
     SIMULATION ENGINE
     Runs when backend is unavailable — animates through
     the generated operation sequence with realistic timing
  =========================================================== */
  const runSimulation = useCallback((ops: Operation[]) => {
    setIsSimulating(true);
    simAbortRef.current = false;
    setSimLogs([]);
    setThoughtsHistory([]);
    setCurrentStreamingThought('');
    setSimulatedCursor({ x: 0, y: 0, visible: false, text: '' });

    const addSimLog = (level: string, message: string) => {
      setSimLogs((prev) => [
        ...prev,
        { level, message, timestamp: Date.now() },
      ].slice(-200));
    };

    // Phase 1: Planning delay (1.5s)
    addSimLog('info', '🧠 PlannerAgent: Analyzing task intent...');
    addSimLog('info', `📋 Task received: "${ops.length > 0 ? ops[0]?.detail?.slice(0, 60) : 'processing'}..."`);

    // Stream initial planning thoughts
    const planningText = `Cognitive Plan Formulated: Spawning secure Chromium viewport. Intent analysis resolved query targeting '${task}'. Allocating dynamic proxy pools and compiling task instructions.`;
    let planningCharIdx = 0;
    const planningTimer = setInterval(() => {
      if (simAbortRef.current) {
        clearInterval(planningTimer);
        return;
      }
      if (planningCharIdx < planningText.length) {
        setCurrentStreamingThought((prev) => prev + planningText[planningCharIdx]);
        planningCharIdx++;
      } else {
        clearInterval(planningTimer);
        // Save to history
        setThoughtsHistory([{ agent: 'PlannerAgent', text: planningText, timestamp: Date.now() }]);
        setCurrentStreamingThought('');
      }
    }, 15);

    const planDelay = setTimeout(() => {
      if (simAbortRef.current) return;
      setPhase('executing');
      addSimLog('info', `✅ Plan created with ${ops.length} steps`);
      addSimLog('info', '🚀 Execution engine started');

      // Phase 2: Step-by-step execution
      let stepIdx = 0;
      let streamTimer: ReturnType<typeof setInterval> | null = null;

      const runNextStep = () => {
        if (simAbortRef.current || stepIdx >= ops.length) {
          if (!simAbortRef.current) {
            setPhase('completed');
            addSimLog('info', '🎉 All operations completed successfully');
            
            // Final thought stream
            const finalThought = "Goal Accomplished: All scraping filters, element selectors, and validation gates successfully completed. Synthesizing data matrices into clean reports for final deployment.";
            setThoughtsHistory((prev) => [...prev, { agent: 'SystemCore', text: finalThought, timestamp: Date.now() }]);
          }
          setIsSimulating(false);
          setSimulatedCursor({ x: 0, y: 0, visible: false, text: '' });
          return;
        }

        const currentOp = ops[stepIdx];
        const idx = stepIdx;

        // Mark as running
        setOperations((prev) =>
          prev.map((op, i) => (i === idx ? { ...op, status: 'running' as OpStatus } : op))
        );
        setCurrentOpIndex(idx);
        addSimLog('info', `▶ Step ${idx + 1}/${ops.length}: ${currentOp.action}`);
        if (currentOp.url) {
          addSimLog('info', `🌐 URL: ${currentOp.url}`);
        }

        // Get cursor coordinates and thoughts
        const cursor = getCursorCoordinatesForStep(currentOp, task, idx);
        setSimulatedCursor(cursor);

        const fullThought = getThoughtForStep(currentOp, task, idx, ops.length);
        let agent = 'PlannerAgent';
        let cleanText = fullThought;
        if (fullThought.startsWith('[')) {
          const closeBracket = fullThought.indexOf(']');
          if (closeBracket > 0) {
            agent = fullThought.slice(1, closeBracket);
            cleanText = fullThought.slice(closeBracket + 1).trim();
            if (cleanText.includes(':')) {
              cleanText = cleanText.slice(cleanText.indexOf(':') + 1).trim();
            }
          }
        }

        // Stream the thoughts letter-by-letter
        let charIdx = 0;
        setCurrentStreamingThought('');
        if (streamTimer) clearInterval(streamTimer);

        streamTimer = setInterval(() => {
          if (simAbortRef.current) {
            if (streamTimer) clearInterval(streamTimer);
            return;
          }
          if (charIdx < cleanText.length) {
            setCurrentStreamingThought((prev) => prev + cleanText[charIdx]);
            charIdx++;
          } else {
            if (streamTimer) clearInterval(streamTimer);
            setThoughtsHistory((prev) => [...prev, { agent, text: cleanText, timestamp: Date.now() }]);
            setCurrentStreamingThought('');
          }
        }, 12); // Stream extremely fast for snappy feel

        // Simulate execution duration (concurrently running)
        const duration = currentOp.duration || (Math.random() * 2000 + 800);

        simTimerRef.current = setTimeout(() => {
          if (simAbortRef.current) {
            if (streamTimer) clearInterval(streamTimer);
            return;
          }

          // Mark as completed
          setOperations((prev) =>
            prev.map((op, i) =>
              i === idx
                ? { ...op, status: 'completed' as OpStatus, duration: Math.round(duration) }
                : op
            )
          );
          addSimLog('info', `✓ Completed: ${currentOp.action} (${(duration / 1000).toFixed(1)}s)`);

          if (currentOp.output) {
            addSimLog('info', `📊 Output: ${currentOp.output}`);
          }

          stepIdx++;
          runNextStep();
        }, Math.max(duration, 2600)); // Give ample time to let thoughts type out completely!
      };

      runNextStep();
    }, 1500);

    simTimerRef.current = planDelay;
  }, [task]);

  // Launch task execution
  const handleLaunch = useCallback(async () => {
    if (!task.trim() || phase === 'executing' || phase === 'planning') return;

    setElapsedTime(0);
    setOperations([]);
    setCurrentOpIndex(-1);
    setPhase('planning');
    setTaskHistory((prev) => [task, ...prev.slice(0, 4)]);
    setSimLogs([]);

    try {
      // 1. Create task via API
      const newTask = await taskService.createTask({
        naturalLanguage: task,
        priority: 'normal',
      });

      // 2. Start execution via API
      const { sessionId: sid } = await startAgentExecution({
        taskId: newTask.id,
        goal: task,
        config: {
          headless: true,
          viewport: { width: 1280, height: 720 },
        },
      });

      setSessionId(sid);
    } catch (err: any) {
      console.warn('Backend unavailable — switching to simulation mode:', err.message || err);
      // FALLBACK: Run simulation with generated operations
      const simOps = generateOperations(task);
      setOperations(simOps);
      runSimulation(simOps);
    }
  }, [task, phase, runSimulation]);

  // Stop execution
  const handleStop = useCallback(() => {
    // Abort simulation
    simAbortRef.current = true;
    if (simTimerRef.current) {
      clearTimeout(simTimerRef.current);
      simTimerRef.current = null;
    }
    setIsSimulating(false);

    if (sessionId) {
      cancelSession(sessionId);
    }
    setPhase('idle');
    setOperations([]);
    setCurrentOpIndex(-1);
    setElapsedTime(0);
    setSessionId(null);
    setSimLogs([]);
  }, [sessionId, cancelSession]);

  const handlePauseToggle = useCallback(() => {
    if (!sessionId) return;
    if (phase === 'paused') {
      resumeSession(sessionId);
    } else {
      pauseSession(sessionId);
    }
  }, [sessionId, phase, pauseSession, resumeSession]);

  // Reset
  const handleReset = useCallback(() => {
    handleStop();
    setTask('');
  }, [handleStop]);

  // Computed values
  const completedOps = operations.filter((o) => o.status === 'completed').length;
  const progress = operations.length > 0 ? Math.round((completedOps / operations.length) * 100) : 0;
  const currentOp = currentOpIndex >= 0 ? operations[currentOpIndex] : null;
  const isRunning = phase === 'executing' || phase === 'planning' || phase === 'paused';

  // QUICK PROMPTS
  const QUICK_PROMPTS = [
    { icon: '🔍', label: 'Google Search', prompt: 'Search Google for the latest AI breakthroughs in 2026 and summarize the top 5 results' },
    { icon: '🛒', label: 'Price Compare', prompt: 'Compare iPhone 16 Pro prices on Amazon vs BestBuy and show a comparison table' },
    { icon: '📰', label: 'News Digest', prompt: 'Find latest technology news headlines and create a summary digest of top stories' },
    { icon: '💼', label: 'LinkedIn Post', prompt: 'Create and publish a professional LinkedIn post about AI automation trends' },
    { icon: '📧', label: 'Draft Email', prompt: 'Open Gmail and draft a professional follow-up email to a client about project status' },
    { icon: '🎬', label: 'YouTube Research', prompt: 'Search YouTube for the best React tutorials in 2026 and list the top 10 by views' },
  ];

  return (
    <div className="space-y-6 animate-fade-up w-full">
      {/* =========================================================
         INTEGRATED SAFETY LAYER: APPROVAL REQUEST
      ========================================================= */}
      <AnimatePresence>
        {pendingApproval && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-lg overflow-hidden rounded-[28px] border border-red-500/20 bg-zinc-950 shadow-2xl"
            >
              {/* Header */}
              <div className="border-b border-white/[0.06] bg-red-500/[0.02] px-6 py-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Human Approval Layer</h3>
                  <p className="text-xs text-zinc-500 font-mono">STEP AUTHORIZATION REQUIRED</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">Action Intent</span>
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {pendingApproval.actionDetails?.description || 'Sensitive browser operation requested.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-4 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Operation Type</span>
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-400 font-bold uppercase text-[10px]">
                      {pendingApproval.actionDetails?.action}
                    </span>
                  </div>

                  {pendingApproval.actionDetails?.target && (
                    <div className="space-y-1">
                      <span className="text-zinc-500 block">Target Element</span>
                      <code className="text-zinc-400 break-all select-all text-[11px] block bg-white/[0.02] p-2 rounded-lg border border-white/[0.04]">
                        {pendingApproval.actionDetails.target}
                      </code>
                    </div>
                  )}

                  {pendingApproval.actionDetails?.value && (
                    <div className="space-y-1">
                      <span className="text-zinc-500 block">Value / Input</span>
                      <code className="text-zinc-400 break-all select-all text-[11px] block bg-white/[0.02] p-2 rounded-lg border border-white/[0.04]">
                        {pendingApproval.actionDetails.value}
                      </code>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-white/[0.04] pt-2 mt-2">
                    <span className="text-zinc-500">Risk Assessment</span>
                    <span className="text-red-400 font-bold uppercase text-[10px]">
                      {pendingApproval.riskLevel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 pt-2 flex gap-3">
                <button
                  onClick={() => sendApprovalResponse(pendingApproval.id, 'DENIED')}
                  className="flex-1 h-11 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm font-bold text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-all"
                >
                  Block Action
                </button>
                <button
                  onClick={() => sendApprovalResponse(pendingApproval.id, 'APPROVED')}
                  className="flex-1 h-11 items-center justify-center rounded-xl bg-red-500 text-sm font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all"
                >
                  Approve Step
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================
         HERO + TASK INPUT (Visible only when idle)
      ========================================================= */}
      {phase === 'idle' ? (
        <div className="omni-hero">
          <div className="task-input-container">
            {/* Title */}
            <div className="mb-6 text-center animate-fade-in">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs font-semibold text-red-300">
                <Sparkles className="h-3.5 w-3.5" />
                Autonomous AI Execution Engine
              </div>
              <h1 className="text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">
                What should I automate?
              </h1>
              <p className="mt-2 text-sm text-zinc-500 max-w-xl mx-auto">
                Describe any task — the AI agent will plan, launch a browser, execute operations, and deliver results autonomously.
              </p>
            </div>

            {/* Task Input Card */}
            <div className="task-input-glow max-w-4xl mx-auto">
              <div className="rounded-3xl border border-white/[0.08] bg-black/40 backdrop-blur-xl overflow-hidden">
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
                    placeholder="e.g. Search Google for the latest AI news, extract top 5 articles, and create a summary report..."
                    rows={3}
                    disabled={isRunning}
                    className="w-full resize-none bg-transparent text-[15px] text-white placeholder:text-zinc-600 focus:outline-none leading-relaxed disabled:opacity-50"
                  />
                </div>

                {/* Bottom bar */}
                <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 bg-black/20">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 font-mono">
                      <Terminal className="h-3 w-3" />
                      {task.length} chars
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleLaunch}
                      disabled={!task.trim()}
                      className="glow-btn flex h-10 items-center gap-2 rounded-xl bg-red-500 px-6 text-sm font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      Launch Agent
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Prompts */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="max-w-4xl mx-auto mt-5 flex flex-wrap gap-2 justify-center"
            >
              {QUICK_PROMPTS.map((qp, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setTask(qp.prompt);
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-white hover:border-white/10 transition-all"
                >
                  <span>{qp.icon}</span>
                  {qp.label}
                </button>
              ))}
            </motion.div>
          </div>
        </div>
      ) : (
        /* COMPACT HUD HEADER (Visible only when running) */
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="hud-compact-deck"
        >
          {/* Active Goal */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/25 red-glow">
              <Bot className="h-5 w-5 text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Active Automation Goal</p>
              <h2 className="text-sm font-bold text-white truncate max-w-2xl leading-tight">
                {task}
              </h2>
            </div>
          </div>

          {/* Controls Panel */}
          <div className="flex items-center gap-3">
            {isRunning && (
              <button
                onClick={handlePauseToggle}
                className="flex h-10 items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] transition-all"
              >
                {phase === 'paused' ? <Play className="h-3.5 w-3.5 text-emerald-400" /> : <Pause className="h-3.5 w-3.5 text-yellow-400" />}
                {phase === 'paused' ? 'Resume' : 'Pause'}
              </button>
            )}

            {isRunning ? (
              <button
                onClick={handleStop}
                className="flex h-10 items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-all"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Abort Goal
              </button>
            ) : (
              <button
                onClick={handleReset}
                className="flex h-10 items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Task
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* =========================================================
         METRICS BAR (visible during/after execution)
      ========================================================= */}
      <AnimatePresence>
        {phase !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="metrics-bar"
          >
            <ProgressRing progress={progress} />

            <div className="flex-1 flex items-center gap-6 flex-wrap">
              <div className="metric-item">
                <div className={cn('metric-dot', phase === 'paused' ? 'bg-yellow-500' : 'bg-red-500')} />
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
                    {completedOps}/{operations.length}
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
                  <p className="text-xs font-bold text-white">{currentOp?.agent || 'SystemCore'}</p>
                </div>
              </div>
            </div>

            {phase === 'completed' && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Task
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================
         EXECUTION DASHBOARD (Browser + Ops Panel)
      ========================================================= */}
      <AnimatePresence>
        {phase !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
            className="exec-dashboard"
          >
            {/* LEFT: BROWSER VIEWPORT */}
            <div className="browser-viewport">
              <div className="browser-topbar">
                <div className="browser-dots">
                  <span />
                  <span />
                  <span />
                </div>

                <div className="browser-url-bar">
                  {currentOp?.url ? (
                    <>
                      <Shield className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                      <span className="url-text">{currentOp.url}</span>
                    </>
                  ) : (
                    <>
                      <Chrome className="h-3 w-3 text-zinc-600 flex-shrink-0" />
                      <span>about:blank</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isRunning && (
                    <div className="live-indicator active">
                      <span className="live-dot" />
                      LIVE
                    </div>
                  )}
                </div>
              </div>

              <div className="browser-content">
                <BrowserSimContent
                  ops={operations}
                  currentIndex={currentOpIndex}
                  phase={phase}
                  latestFrame={latestFrame}
                  task={task}
                  simulatedCursor={simulatedCursor}
                />
              </div>
            </div>

            {/* RIGHT: OPERATIONS LOG PANEL */}
            <div className="ops-panel">
              <div className="ops-panel-header">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-red-400" />
                  <h3 className="text-[13px] font-bold text-white">Operations Dashboard</h3>
                </div>
                <span className="text-[10px] font-mono text-zinc-600">
                  {completedOps}/{operations.length} steps
                </span>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-white/[0.06] bg-black/20 overflow-x-auto flex-shrink-0">
                <button
                  onClick={() => setActiveTab('thoughts')}
                  className={cn(
                    'flex-shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all',
                    activeTab === 'thoughts'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  AI Thoughts
                </button>
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={cn(
                    'flex-shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all',
                    activeTab === 'timeline'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  Timeline
                </button>
                <button
                  onClick={() => setActiveTab('logs')}
                  className={cn(
                    'flex-shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all',
                    activeTab === 'logs'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  Logs ({(socketLogs.length + simLogs.length)})
                </button>
                <button
                  onClick={() => setActiveTab('profile')}
                  className={cn(
                    'flex-shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all',
                    activeTab === 'profile'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  Profile Memory
                </button>
                <button
                  onClick={() => setActiveTab('skills')}
                  className={cn(
                    'flex-shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all',
                    activeTab === 'skills'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  Skills Show ({skills.length})
                </button>
              </div>

              <div ref={logContainerRef} className="ops-log-container">
                {activeTab === 'thoughts' ? (
                  <div className="space-y-4 p-2 text-left font-mono text-[11px]">
                    {/* Render completed thoughts */}
                    {thoughtsHistory.map((th, i) => (
                      <div key={i} className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider",
                            th.agent === 'PlannerAgent' ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                            th.agent === 'BrowserAgent' ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                            th.agent === 'ExtractorAgent' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            "bg-red-500/10 text-red-400 border border-red-500/20"
                          )}>
                            {th.agent}
                          </span>
                          <span className="text-[8px] text-zinc-600">{new Date(th.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-zinc-300 leading-relaxed text-xs">{th.text}</p>
                      </div>
                    ))}
                    
                    {/* Render currently streaming thought */}
                    {currentStreamingThought && (
                      <div className="p-3 rounded-2xl bg-red-500/[0.02] border border-red-500/10 space-y-2 relative overflow-hidden shimmer-effect">
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded font-black text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider animate-pulse">
                            {currentOp?.agent || 'PlannerAgent'}
                          </span>
                          <span className="text-[8px] text-zinc-500">Streaming thoughts...</span>
                        </div>
                        <p className="text-white leading-relaxed text-xs cursor-typing-effect">
                          {currentStreamingThought}
                        </p>
                      </div>
                    )}

                    {!currentStreamingThought && thoughtsHistory.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
                        <Loader2 className="h-5 w-5 animate-spin mb-2" />
                        <span>Initializing Agent Cognitive Thread...</span>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'timeline' ? (
                  operations.map((op, i) => {
                    const isActive = op.status === 'running';
                    const isDone = op.status === 'completed';
                    const isFailed = op.status === 'failed';

                    return (
                      <motion.div
                        key={op.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className={cn('ops-entry', isActive && 'active', isDone && 'completed')}
                      >
                        {/* Status icon */}
                        <div className={cn('ops-icon', op.type)}>
                          {isActive ? (
                            <Loader2 className="h-3.5 w-3.5 text-red-400 animate-spin" />
                          ) : isDone ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          ) : isFailed ? (
                            <XCircle className="h-3.5 w-3.5 text-red-400" />
                          ) : (
                            OP_ICONS[op.type]
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                'text-[11px] font-semibold truncate',
                                isActive ? 'text-white' : isDone ? 'text-zinc-500' : 'text-zinc-400'
                              )}
                            >
                              {op.action}
                            </p>
                          </div>
                          <p className="text-[10px] text-zinc-600 truncate mt-0.5">{op.detail}</p>

                          {/* Agent badge */}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span
                              className={cn(
                                'agent-avatar',
                                op.agent === 'PlannerAgent'
                                  ? 'planner'
                                  : op.agent === 'BrowserAgent'
                                    ? 'browser'
                                    : op.agent === 'ExtractorAgent'
                                      ? 'extractor'
                                      : 'core'
                              )}
                            >
                              {op.agent === 'PlannerAgent'
                                ? 'P'
                                : op.agent === 'BrowserAgent'
                                  ? 'B'
                                  : op.agent === 'ExtractorAgent'
                                    ? 'E'
                                    : 'S'}
                            </span>
                            <span className="text-[9px] text-zinc-600 font-mono">{op.agent}</span>
                            {isDone && op.duration && (
                              <span className="text-[9px] text-zinc-700 font-mono ml-auto">
                                {(op.duration / 1000).toFixed(1)}s
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                ) : activeTab === 'logs' ? (() => {
                  const allLogs = [...simLogs, ...socketLogs].sort((a, b) => a.timestamp - b.timestamp);
                  return allLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-12 text-zinc-600">
                      <Loader2 className="h-5 w-5 animate-spin mb-2" />
                      <span>Listening for system logs...</span>
                    </div>
                  ) : (
                    <div className="font-mono text-[10px] text-zinc-400 space-y-1 px-2">
                      {allLogs.map((log, i) => (
                        <div key={i} className="flex items-start gap-2 py-0.5 leading-relaxed">
                          <span className="text-zinc-600 flex-shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={cn(
                            'flex-shrink-0 uppercase font-bold text-[8px] px-1 rounded',
                            log.level === 'error' ? 'bg-red-500/10 text-red-400' :
                            log.level === 'warn' ? 'bg-yellow-500/10 text-yellow-400' :
                            'bg-zinc-800 text-zinc-400'
                          )}>
                            {log.level}
                          </span>
                          <span className="text-zinc-300 break-all">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  );
                })() : activeTab === 'profile' ? (
                  <div className="space-y-6 p-4 text-left font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Brain className="h-4 w-4 text-red-400 animate-pulse" />
                        UserProfileMemory Card
                      </h4>
                      <button
                        onClick={saveProfileCard}
                        disabled={savingProfile}
                        className="h-8 px-3 rounded-lg bg-red-500 text-[10px] font-bold text-white transition-all hover:scale-105 flex items-center gap-1.5 disabled:opacity-50"
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
                      <div className="flex flex-col items-center justify-center py-8 text-zinc-500 font-mono text-[10px] gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                        LOADING SECURE SEMANTIC CARD...
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[9px] text-zinc-500 uppercase tracking-widest">Personal Details</label>
                          <div className="grid grid-cols-1 gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.01]">
                              <UserIcon className="h-3.5 w-3.5 text-zinc-500" />
                              <input
                                type="text"
                                value={profile.name}
                                onChange={(e) => setProfile((p: any) => ({ ...p, name: e.target.value }))}
                                placeholder="Full Name"
                                className="bg-transparent border-none text-white text-xs placeholder-zinc-700 focus:outline-none flex-1 font-mono"
                              />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.01]">
                              <MailIcon className="h-3.5 w-3.5 text-zinc-500" />
                              <input
                                type="email"
                                value={profile.email}
                                onChange={(e) => setProfile((p: any) => ({ ...p, email: e.target.value }))}
                                placeholder="Email Address"
                                className="bg-transparent border-none text-white text-xs placeholder-zinc-700 focus:outline-none flex-1 font-mono"
                              />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.01]">
                              <PhoneIcon className="h-3.5 w-3.5 text-zinc-500" />
                              <input
                                type="text"
                                value={profile.phone}
                                onChange={(e) => setProfile((p: any) => ({ ...p, phone: e.target.value }))}
                                placeholder="Phone Number"
                                className="bg-transparent border-none text-white text-xs placeholder-zinc-700 focus:outline-none flex-1 font-mono"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] text-zinc-500 uppercase tracking-widest">Addresses</label>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newAddress}
                              onChange={(e) => setNewAddress(e.target.value)}
                              placeholder="New address line..."
                              className="flex-1 bg-white/[0.01] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-700 focus:outline-none font-mono"
                            />
                            <button
                              onClick={addAddress}
                              className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-red-500 text-white transition-all hover:scale-105"
                            >
                              <PlusIcon className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="space-y-1.5 max-h-[100px] overflow-y-auto">
                            {profile.addresses.map((addr: string, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-white/5 bg-white/[0.01] text-[11px] text-zinc-400">
                                <span className="truncate">{addr}</span>
                                <button onClick={() => removeAddress(i)} className="text-zinc-600 hover:text-red-400">
                                  <Trash2Icon className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] text-zinc-500 uppercase tracking-widest">Favorite Portals</label>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newSite}
                              onChange={(e) => setNewSite(e.target.value)}
                              placeholder="Domain (e.g. flipkart.com)..."
                              className="flex-1 bg-white/[0.01] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-700 focus:outline-none font-mono"
                            />
                            <button
                              onClick={addFavoriteSite}
                              className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-red-500 text-white transition-all hover:scale-105"
                            >
                              <PlusIcon className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="space-y-1.5 max-h-[100px] overflow-y-auto">
                            {profile.favoriteSites.map((site: string, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-white/5 bg-white/[0.01] text-[11px] text-zinc-400">
                                <span className="truncate">{site}</span>
                                <button onClick={() => removeFavoriteSite(i)} className="text-zinc-600 hover:text-red-400">
                                  <Trash2Icon className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 p-4 text-left font-mono text-xs">
                    <div className="border-b border-white/5 pb-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Universal Primitive Skills</h4>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Modular building blocks composing planned workflows.</p>
                    </div>

                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      {skills.map((sk) => (
                        <div key={sk.name} className="p-3 rounded-xl border border-white/5 bg-white/[0.01] space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs font-bold text-white">{sk.name}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 leading-normal">{sk.description}</p>
                          <div className="space-y-1">
                            {Object.keys(sk.parameters || {}).map((param) => (
                              <div key={param} className="flex items-center justify-between text-[9px] bg-black/35 rounded px-2 py-0.5 text-zinc-500">
                                <span>{param}</span>
                                <span>{sk.parameters[param].type}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completion summary */}
                {phase === 'completed' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="result-card success mt-4"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      <h4 className="text-sm font-bold text-emerald-400">Execution Complete</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-lg bg-black/30 p-3">
                        <p className="text-lg font-black text-white">{operations.length}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Steps</p>
                      </div>
                      <div className="rounded-lg bg-black/30 p-3">
                        <p className="text-lg font-black text-white">{(elapsedTime / 1000).toFixed(1)}s</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Time</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================
         TASK HISTORY (when idle and has history)
      ========================================================= */}
      {phase === 'idle' && taskHistory.length > 0 && (
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
                className="w-full flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.01] px-4 py-3 text-left hover:bg-white/[0.03] hover:border-white/[0.08] transition-all group"
              >
                <Clock className="h-4 w-4 text-zinc-600 flex-shrink-0" />
                <span className="text-sm text-zinc-400 truncate flex-1">{t}</span>
                <ArrowRight className="h-3.5 w-3.5 text-zinc-700 group-hover:text-red-400 transition-colors" />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}