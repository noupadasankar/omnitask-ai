'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  ShieldCheck,
  Workflow,
  Terminal,
  Cpu,
  Sparkles,
  Activity,
  Command,
  X,
  Check,
  AlertTriangle,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* =====================================================
   FEATURE CONFIG WITH DETAILS & SIMULATIONS
   ===================================================== */

interface FeatureSpec {
  icon: any;
  title: string;
  badge: string;
  description: string;
  longDescription: string;
  capabilities: string[];
  techSpecs: { label: string; value: string }[];
  simulationType: 'multi-agent' | 'approval' | 'graph' | 'console' | 'automation' | 'observability';
}

const features: FeatureSpec[] = [
  {
    icon: BrainCircuit,
    title: 'Multi-Agent Intelligence',
    badge: 'COOPERATIVE RUNTIME',
    description: 'Planner, Browser, API, and Supervisor agents coordinate autonomously.',
    longDescription: 'OmniTask AI implements a decentralized agent architecture where specialized nodes coordinate using an event-driven orchestrator. A supervisor continuously evaluates outcomes, re-routing subtasks to guarantee goal achievement.',
    capabilities: [
      'Subtask decomposition and runtime graph generation',
      'Sandboxed web execution with local state management',
      'Asynchronous task delegation via internal message broker',
      'Continuous supervisor verification and automated healing'
    ],
    techSpecs: [
      { label: 'Orchestrator', value: 'Event-driven message bus' },
      { label: 'Agent Stack', value: 'Planner, Browser, API, Supervisor' },
      { label: 'LLM Engine', value: 'GPT-4o / Claude 3.5 Sonnet' },
      { label: 'Routing Protocol', value: 'Dynamic Directed Acyclic Graph (DAG)' }
    ],
    simulationType: 'multi-agent'
  },
  {
    icon: ShieldCheck,
    title: 'Human Approval Layer',
    badge: 'ENTERPRISE GUARDRAILS',
    description: 'Critical actions require approval before execution for enterprise safety.',
    longDescription: 'Ensure safety, alignment, and full control over autonomous workflows. When an agent encounters sensitive actions (e.g. database updates, payment processing, sending outbound emails), the execution pauses and alerts the supervisor.',
    capabilities: [
      'Configurable safety thresholds for automated actions',
      'Dual-signature cryptographic request confirmation',
      'Real-time execution suspend/resume with context variables',
      'Comprehensive audit trails mapping agent intent to user approvals'
    ],
    techSpecs: [
      { label: 'Clearance Level', value: 'Role-Based Access Control (RBAC)' },
      { label: 'Clearance Channels', value: 'Slack, Email, In-app Modal' },
      { label: 'Cryptographic Signing', value: 'HS256 Session Clearance Tokens' },
      { label: 'Audit Log Retention', value: 'Forever (Compliance-aligned)' }
    ],
    simulationType: 'approval'
  },
  {
    icon: Workflow,
    title: 'Execution Graph Engine',
    badge: 'RECOVERY ORCHESTRATION',
    description: 'Visual orchestration system with retries, checkpoints, and recovery.',
    longDescription: 'Transform complex task requests into robust, fault-tolerant execution graphs. If an external service fails or a webpage structure changes unexpectedly, the engine rolls back to the nearest checkpoint, adjusts parameters, and retries.',
    capabilities: [
      'Dynamic Directed Acyclic Graph (DAG) generation',
      'Fail-safe checkpointing for long-running workflows',
      'Self-healing route selection on node execution failure',
      'Visual runtime debugger showing state and dependencies'
    ],
    techSpecs: [
      { label: 'State Machine', value: 'Custom DAG Engine with Redis persistence' },
      { label: 'Max Retries', value: '5 (Backoff coefficient: 2.0)' },
      { label: 'Checkpoint Latency', value: '< 20ms write-to-store' },
      { label: 'Visual Format', value: 'React Flow compatible JSON graph schema' }
    ],
    simulationType: 'graph'
  },
  {
    icon: Terminal,
    title: 'Live Runtime Console',
    badge: 'OBSERVABILITY PIPELINE',
    description: 'Observe agents executing tasks in real time with structured logs.',
    longDescription: 'Step inside the brain of your running AI agents. The Live Runtime Console stream logs, state transformations, variable changes, tool inputs, and screenshot previews in real-time, providing complete transparency.',
    capabilities: [
      'Live WebSocket log streaming with customizable filters',
      'Real-time variable inspector showing active state variables',
      'Terminal stdout/stderr mirroring from sandboxed runtimes',
      'Detailed API response inspection with status codes'
    ],
    techSpecs: [
      { label: 'Stream Type', value: 'Bidirectional Socket.io Stream' },
      { label: 'Terminal Buffer', value: '10,000 lines history cache' },
      { label: 'Update Latency', value: '< 15ms' },
      { label: 'Data Type', value: 'Formatted JSON with terminal color coding' }
    ],
    simulationType: 'console'
  },
  {
    icon: Cpu,
    title: 'Autonomous Automation',
    badge: 'ZERO-CODE AUTOMATIONS',
    description: 'Natural language workflows executed across browsers, APIs, and files.',
    longDescription: 'Turn human language into complex, cross-application automations. Simply type what you want to achieve, and OmniTask AI handles the browser clicks, file creation, data validation, and webhook dispatching with zero setup.',
    capabilities: [
      'Natural Language compiler to execution instructions',
      'Multi-application flow orchestration (Web, REST APIs, CSV/PDFs)',
      'Automated document parser (invoices, resumes, reports)',
      'Dynamic webhook triggers and external API dispatchers'
    ],
    techSpecs: [
      { label: 'Input Parser', value: 'Semantic Intent Compiler (LLM-based)' },
      { label: 'Browser Engine', value: 'Playwright Sandbox (Chromium/Firefox)' },
      { label: 'Document Parsers', value: 'OCR & PDF Layout Analyser Engine' },
      { label: 'API Integration', value: 'Dynamic Axios REST Generator' }
    ],
    simulationType: 'automation'
  },
  {
    icon: Activity,
    title: 'Realtime Observability',
    badge: 'PERFORMANCE TELEMETRY',
    description: 'Metrics, traces, execution history, and runtime health monitoring.',
    longDescription: 'Monitor latency, cost-efficiency, token usage, and system health at scale. The observability cockpit tracks performance across agents, databases, queue backlogs, and memory systems in real time.',
    capabilities: [
      'Live CPU, RAM, and database pool utilization graphs',
      'Real-time token cost calculator and budget alerts',
      'Distributed tracing maps showing agent execution paths',
      'Queue backlog alerts and automated node auto-scaling metrics'
    ],
    techSpecs: [
      { label: 'Metrics Engine', value: 'Prometheus & OpenTelemetry compliant' },
      { label: 'Cost Tracker', value: 'Per-Token API Price Monitor' },
      { label: 'Trace Format', value: 'Jaeger/OTLP Context Propagator' },
      { label: 'Telemetry Rate', value: '1-second granularity polling' }
    ],
    simulationType: 'observability'
  }
];

export default function HomePage() {
  const [selectedFeature, setSelectedFeature] = useState<FeatureSpec | null>(null);

  return (
    <div className="relative overflow-hidden min-h-screen">
      {/* ===================================================== */}
      {/* NAVBAR */}
      {/* ===================================================== */}
      <header className="fixed top-0 left-0 right-0 w-full z-50 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          {/* LOGO */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 red-glow">
              <Bot className="h-6 w-6 text-red-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-wide text-white">OmniTask AI</h1>
              <p className="text-xs text-zinc-500">Autonomous Operations</p>
            </div>
          </div>

          {/* NAV */}
          <div className="hidden items-center gap-10 md:flex">
            <a href="#features" className="text-sm text-zinc-400 transition hover:text-white">Features</a>
            <a href="#architecture" className="text-sm text-zinc-400 transition hover:text-white">Architecture</a>
            <a href="#execution" className="text-sm text-zinc-400 transition hover:text-white">Execution</a>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.05]">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button className="rounded-xl bg-red-500 text-white hover:bg-red-600">
                Start Building
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ===================================================== */}
      {/* HERO */}
      {/* ===================================================== */}
      <section className="relative mx-auto flex min-h-[90vh] max-w-7xl flex-col items-center justify-center px-6 py-32 text-center">
        {/* BADGE */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300"
        >
          <Sparkles className="h-4 w-4" />
          Enterprise Autonomous Agent Platform
        </motion.div>

        {/* TITLE */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-6xl text-5xl font-black leading-[0.95] tracking-[-0.05em] text-white md:text-7xl"
        >
          AI Agents That
          <br />
          <span className="text-gradient">Actually Execute</span>
        </motion.h1>

        {/* DESCRIPTION */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 max-w-3xl text-lg leading-relaxed text-zinc-400 md:text-xl"
        >
          OmniTask AI orchestrates autonomous agents that plan, reason, browse, automate, validate, and complete real-world workflows across browsers, APIs, and enterprise systems.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12 flex flex-col items-center gap-4 sm:flex-row"
        >
          <Link href="/register">
            <Button className="group h-14 rounded-2xl bg-red-500 px-8 text-base font-medium hover:bg-red-600">
              Launch Platform
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
          <a href="#features">
            <Button variant="ghost" className="h-14 rounded-2xl border border-white/10 bg-white/[0.03] px-8 text-base text-zinc-300 hover:bg-white/[0.05]">
              Explore Capabilities
            </Button>
          </a>
        </motion.div>

        {/* INTEGRATED GRAPHIC */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-24 w-full max-w-6xl"
        >
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-xl">
            {/* WINDOW TOP HEADER */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                </div>
                <span className="font-mono text-sm text-zinc-500">autonomous-runtime.console</span>
              </div>
              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                LIVE
              </div>
            </div>

            {/* CONTENT SPLIT */}
            <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
              {/* RUNTIME STREAM */}
              <div className="border-b border-white/10 p-6 lg:border-b-0 lg:border-r text-left">
                <div className="mb-6 flex items-center gap-3">
                  <div className="animate-pulse h-3 w-3 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
                  <span className="font-mono text-sm text-zinc-400">Executing autonomous workflow</span>
                </div>
                <div className="space-y-3 font-mono text-xs sm:text-sm text-zinc-500">
                  <p>→ Initializing <span className="text-purple-400">PlannerAgent</span>...</p>
                  <p>→ Building Directed Acyclic Graph (DAG) flow...</p>
                  <p>→ Launching sandboxed <span className="text-blue-400">BrowserAgent</span>...</p>
                  <p>→ Guardrail verification sequence completed successfully...</p>
                  <p>→ Automated competitor price analysis completed...</p>
                  <p className="text-emerald-400">→ Task execution resolved. Output: CSV stored in database.</p>
                </div>
              </div>

              {/* TELEMETRY */}
              <div className="p-6 text-left">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-zinc-300">Runtime Telemetry</h3>
                  <div className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-300 font-mono">Active</div>
                </div>
                <div className="space-y-4">
                  <Metric label="Active Agents" value="04" />
                  <Metric label="Queue Depth" value="12" />
                  <Metric label="Execution Success" value="98.2%" />
                  <Metric label="Runtime Health" value="Operational" success />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ===================================================== */}
      {/* FEATURES SECTION WITH INTERACTIVE CARDS */}
      {/* ===================================================== */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-32 border-t border-white/[0.05]">
        <div className="mb-20 text-center">
          <div className="mb-4 inline-flex rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300 font-semibold tracking-wider uppercase">
            Platform Capabilities
          </div>
          <h2 className="text-4xl font-bold md:text-5xl text-white">Built for Autonomous Execution</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-500 leading-relaxed">
            Enterprise-grade orchestration layer for AI agents operating across browsers, APIs, files, and workflows. Click any capability below to explore.
          </p>
        </div>

        {/* CARDS GRID */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                viewport={{ once: true }}
                onClick={() => setSelectedFeature(feature)}
                className="group relative cursor-pointer overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02] p-8 backdrop-blur-xl transition-all duration-300 hover:border-red-500/30 hover:bg-red-500/[0.02] hover:shadow-[0_0_30px_rgba(239,68,68,0.05)]"
              >
                {/* Visual glow on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 via-red-500/0 to-red-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-red-500/5 blur-3xl opacity-0 group-hover:opacity-100 transition-all duration-500" />

                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-white group-hover:text-red-400 transition-colors duration-300">
                  {feature.title}
                </h3>
                <p className="leading-relaxed text-zinc-500 text-sm group-hover:text-zinc-400 transition-colors duration-300">
                  {feature.description}
                </p>
                <div className="mt-6 flex items-center gap-1 text-xs font-semibold text-red-400 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                  Interactive Simulator <ArrowRight className="h-3 w-3" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ===================================================== */}
      {/* INTERACTIVE SPECS DIALOG / PLAYGROUND */}
      {/* ===================================================== */}
      <AnimatePresence>
        {selectedFeature && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="relative w-full max-w-5xl rounded-[32px] border border-white/10 bg-zinc-950 p-6 md:p-8 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            >
              {/* Backglow decor */}
              <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-red-500/5 blur-[100px] pointer-events-none" />
              <div className="absolute left-1/4 bottom-0 h-48 w-48 rounded-full bg-blue-500/5 blur-[90px] pointer-events-none" />

              {/* Header */}
              <div className="flex items-start justify-between border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400">
                    <selectedFeature.icon className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] tracking-widest font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded">
                        {selectedFeature.badge}
                      </span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-black text-white mt-1">{selectedFeature.title}</h2>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFeature(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Grid content */}
              <div className="grid lg:grid-cols-2 gap-8 py-6 overflow-y-auto flex-1">
                {/* Left spec info */}
                <div className="space-y-6 text-left">
                  <div>
                    <h4 className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-wider mb-2">Capability Overview</h4>
                    <p className="text-zinc-400 text-sm leading-relaxed">{selectedFeature.longDescription}</p>
                  </div>

                  <div>
                    <h4 className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-wider mb-3">Key Technical Features</h4>
                    <ul className="space-y-2.5">
                      {selectedFeature.capabilities.map((cap) => (
                        <li key={cap} className="flex items-start gap-2.5 text-xs md:text-sm text-zinc-300">
                          <Check className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <span>{cap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-xs font-mono font-bold text-zinc-500 uppercase tracking-wider mb-3">Architecture Specifications</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedFeature.techSpecs.map((spec) => (
                        <div key={spec.label} className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-3 text-left">
                          <p className="text-[10px] text-zinc-500 font-mono uppercase">{spec.label}</p>
                          <p className="text-xs font-semibold text-white mt-1 font-mono">{spec.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Interactive Simulator */}
                <div className="flex flex-col rounded-[24px] border border-white/10 bg-black/40 overflow-hidden min-h-[350px] shadow-inner relative">
                  <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 bg-black/20">
                    <span className="text-xs font-mono font-semibold text-zinc-400 flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-red-400" />
                      SIMULATOR_INSTANCE
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase">Interactive Playground</span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between overflow-y-auto">
                    <InteractivePlayground type={selectedFeature.simulationType} />
                  </div>
                </div>
              </div>

              {/* Footer action */}
              <div className="border-t border-white/10 pt-4 flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedFeature(null)}
                  className="border border-white/10 text-zinc-300 hover:bg-white/5"
                >
                  Close specifications
                </Button>
                <Link href="/register">
                  <Button className="bg-red-500 text-white hover:bg-red-600">
                    Deploy this capability <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================================================== */}
      {/* STATS BAR  — social proof, not in hero or features   */}
      {/* ===================================================== */}
      <section className="border-t border-white/[0.05] bg-transparent">
        <div className="mx-auto max-w-7xl px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '4',     label: 'Specialized Agents',  sub: 'Planner · Browser · Verifier · Supervisor', color: 'text-red-400' },
            { value: '98.2%', label: 'Execution Success',   sub: 'Across all workflow types',                  color: 'text-emerald-400' },
            { value: '<20ms', label: 'Checkpoint Latency',  sub: 'Write-to-store, Redis-backed',               color: 'text-cyan-400' },
            { value: '∞',     label: 'Task Domains',        sub: 'Browser · API · File · Form · Data',         color: 'text-purple-400' },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              viewport={{ once: true }}
            >
              <p className={`text-4xl font-black font-mono ${s.color}`}>{s.value}</p>
              <p className="mt-2 text-sm font-bold text-white">{s.label}</p>
              <p className="mt-1 text-xs text-zinc-600">{s.sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===================================================== */}
      {/* PRE-FOOTER CTA — re-engage before they leave          */}
      {/* ===================================================== */}
      <section className="border-t border-white/[0.05]">
        <div className="relative mx-auto max-w-7xl px-6 py-24 text-center overflow-hidden">
          {/* ambient glow */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-96 w-96 rounded-full bg-red-500/8 blur-[120px]" />
          </div>
          <div className="relative z-10">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs font-bold text-red-300 uppercase tracking-widest">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              All agents online · System ready
            </div>
            <h2 className="mx-auto max-w-3xl text-4xl md:text-5xl font-black tracking-[-0.04em] text-white leading-tight">
              Ready to deploy your first<br />
              <span className="text-gradient">autonomous workflow?</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-500 leading-relaxed">
              One sentence is all it takes. OmniTask parses your goal, builds the execution graph,
              launches a real browser, and hands you back verified results.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/register">
                <Button className="group h-14 rounded-2xl bg-red-500 px-10 text-base font-semibold hover:bg-red-600 shadow-2xl shadow-red-500/20">
                  Start Building Free
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" className="h-14 rounded-2xl border border-white/10 bg-white/[0.03] px-10 text-base text-zinc-300 hover:bg-white/[0.06]">
                  Sign In to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================== */}
      {/* FOOTER                                                */}
      {/* ===================================================== */}
      <footer className="border-t border-white/[0.06] bg-transparent">

        {/* ── Nav columns ── */}
        <div className="mx-auto max-w-7xl px-6 py-16 grid grid-cols-2 md:grid-cols-4 gap-10">

       

          {/* Platform */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-5">Platform</p>
            <ul className="space-y-3">
              {[
                { label: 'Dashboard',     href: '/dashboard' },
                { label: 'Job Automation',href: '/jobs' },
                { label: 'Analytics',     href: '/analytics' },
                { label: 'Task History',  href: '/history' },
                { label: 'Agent Registry',href: '/agents' },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs text-zinc-500 hover:text-white transition-colors font-medium">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Capabilities */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-5">Capabilities</p>
            <ul className="space-y-3">
              {[
                'Multi-Agent Orchestration',
                'Human Approval Gate',
                'Execution Graph Engine',
                'Live Runtime Console',
                'Autonomous Automation',
                'Realtime Observability',
              ].map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <Check className="h-2.5 w-2.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-xs text-zinc-500 font-medium">{c}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Agent System */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-5">Agent System</p>
            <ul className="space-y-3">
              {[
                { name: 'PlannerAgent',      color: 'bg-red-500' },
                { name: 'BrowserAgent',      color: 'bg-blue-500' },
                { name: 'VerifierAgent',     color: 'bg-emerald-500' },
                { name: 'GoalUnderstanding', color: 'bg-cyan-500' },
                { name: 'SelfHealing',       color: 'bg-amber-500' },
                { name: 'DriftDetector',     color: 'bg-purple-500' },
              ].map((a) => (
                <li key={a.name} className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${a.color}`} />
                  <span className="text-xs text-zinc-500 font-mono">{a.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Brand baseline ── */}
        

      </footer>
    </div>
  );
}

/* =====================================================
   INTERACTIVE SIMULATORS COMPONENTS
   ===================================================== */

interface InteractivePlaygroundProps {
  type: FeatureSpec['simulationType'];
}

function InteractivePlayground({ type }: InteractivePlaygroundProps) {
  switch (type) {
    case 'multi-agent':
      return <MultiAgentSim />;
    case 'approval':
      return <ApprovalSim />;
    case 'graph':
      return <GraphSim />;
    case 'console':
      return <ConsoleSim />;
    case 'automation':
      return <AutomationSim />;
    case 'observability':
      return <ObservabilitySim />;
    default:
      return null;
  }
}

// 1. MULTI-AGENT INTELLIGENCE SIMULATOR
function MultiAgentSim() {
    const [messages, setMessages] = useState<Array<{ sender: string; text: string; role: string; color: string }>>([
      { sender: 'PlannerAgent', role: 'PLANNER', text: 'Task initialized: Scrape stock trends and save to DB', color: 'text-purple-400 border-purple-500/30 bg-purple-500/5' },
    ]);
    const [step, setStep] = useState(0);

    const nextStep = () => {
      const dialogue = [
        { sender: 'PlannerAgent', role: 'PLANNER', text: 'Decomposed goal into 3 steps. Requesting BrowserAgent to fetch yahoo.com', color: 'text-purple-400 border-purple-500/30 bg-purple-500/5' },
        { sender: 'BrowserAgent', role: 'BROWSER', text: 'Opening Chromium. Loading yahoo.com/gainers.', color: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
        { sender: 'PolicyEngine', role: 'SUPERVISOR', text: 'Policy Check: target domain matches strict compliance rules. Clear.', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' },
        { sender: 'BrowserAgent', role: 'BROWSER', text: 'Parsed rows [Symbol: NVDA, Price: $120, Change: +4%]. Routing data.', color: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
        { sender: 'ExecutionCore', role: 'EXECUTOR', text: 'Received symbol NVDA payload. Saving into database.', color: 'text-red-400 border-red-500/30 bg-red-500/5' },
        { sender: 'PlannerAgent', role: 'PLANNER', text: 'All subtasks verified. Workflow completed. Output resolved.', color: 'text-purple-400 border-purple-500/30 bg-purple-500/5' }
      ];

      if (step < dialogue.length) {
        setMessages((prev) => [...prev, dialogue[step]]);
        setStep(step + 1);
      } else {
        setMessages([dialogue[0]]);
        setStep(0);
      }
    };

    return (
      <div className="flex flex-col justify-between h-full min-h-[300px]">
        <div className="space-y-3 font-mono text-xs text-left max-h-[220px] overflow-y-auto mb-4 scrollbar-thin">
          {messages.map((msg, i) => (
            <div key={i} className={cn("p-2.5 rounded-lg border flex items-start gap-2", msg.color)}>
              <span className="font-bold flex-shrink-0">[{msg.sender}]:</span>
              <span className="text-zinc-300">{msg.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={nextStep} className="bg-red-500 text-white hover:bg-red-600 flex-1 font-mono text-xs">
            {step < 6 ? 'Simulate Next Coordination Step →' : 'Reset Simulation'}
          </Button>
        </div>
      </div>
    );
}

// 2. HUMAN APPROVAL LAYER SIMULATOR
function ApprovalSim() {
    const [approvalState, setApprovalState] = useState<'idle' | 'approved' | 'rejected'>('idle');
    const [submitting, setSubmitting] = useState(false);

    const handleAction = (decision: 'approved' | 'rejected') => {
      setSubmitting(true);
      setTimeout(() => {
        setApprovalState(decision);
        setSubmitting(false);
      }, 800);
    };

    return (
      <div className="flex flex-col justify-between h-full min-h-[300px]">
        <div className="p-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 text-left space-y-4">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-mono text-xs font-bold uppercase">Pending Clearance Request</span>
          </div>

          <div className="space-y-1 font-mono text-[11px] text-zinc-400">
            <p><span className="text-zinc-600">ACTION_TYPE:</span> outbound-email-send</p>
            <p><span className="text-zinc-600">TARGET:</span> partner-relations@vendor.com</p>
            <p><span className="text-zinc-600">PAYLOAD:</span> "Dear Partner, Please find the invoice attachments..."</p>
          </div>

          <div className="border-t border-white/5 pt-3">
            <span className="text-[10px] font-mono text-zinc-500 font-semibold">SIGNATURE: SHA-256 SECURE HANDSHAKE</span>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center justify-center">
          {submitting && (
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-red-500" />
              Verifying Cryptographic Credentials...
            </div>
          )}

          {!submitting && approvalState === 'idle' && (
            <div className="flex gap-3 w-full">
              <Button onClick={() => handleAction('rejected')} variant="outline" className="flex-1 border-red-500/20 text-red-400 hover:bg-red-500/10">
                Reject
              </Button>
              <Button onClick={() => handleAction('approved')} className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700">
                Approve Action
              </Button>
            </div>
          )}

          {!submitting && approvalState === 'approved' && (
            <div className="p-3 w-full text-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-xs">
              ✓ Action Approved. cryptographic-token verified. Outbound email dispatched.
            </div>
          )}

          {!submitting && approvalState === 'rejected' && (
            <div className="p-3 w-full text-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 font-mono text-xs">
              ✕ Action Aborted. Outbound cancelled by supervisor. System state locked.
            </div>
          )}
        </div>
      </div>
    );
}

// 3. EXECUTION GRAPH SIMULATOR
function GraphSim() {
    const [graphStep, setGraphStep] = useState(0);

    const stepsList = [
      { name: '1. Intent Parse', state: 'resolved', desc: 'Resolved instruction' },
      { name: '2. Site Fetch', state: 'resolved', desc: 'Opened target browser tab' },
      { name: '3. Data Extract', state: 'failed', desc: 'Error: Rate limit encountered' },
      { name: '4. Recovery Retry', state: 'recovering', desc: 'Retrying with proxy rotation...' },
      { name: '5. Success Sync', state: 'pending', desc: 'Write payload to database' }
    ];

    const advanceGraph = () => {
      if (graphStep < stepsList.length - 1) {
        setGraphStep(graphStep + 1);
      } else {
        setGraphStep(0);
      }
    };

    return (
      <div className="flex flex-col justify-between h-full min-h-[300px]">
        <div className="space-y-3">
          {stepsList.map((step, idx) => {
            const isCurrent = graphStep === idx;
            const isDone = idx < graphStep;
            const isFailed = step.state === 'failed';
            const isRecovering = step.state === 'recovering';

            return (
              <div
                key={step.name}
                className={cn(
                  "p-2.5 rounded-xl border flex items-center justify-between text-left font-mono text-xs transition-all",
                  isCurrent
                    ? isFailed
                      ? "border-red-500/50 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                      : isRecovering
                        ? "border-yellow-500/50 bg-yellow-500/5 animate-pulse"
                        : "border-blue-500/50 bg-blue-500/5"
                    : isDone
                      ? "border-emerald-500/20 bg-emerald-500/5 opacity-60"
                      : "border-white/5 bg-white/[0.01] opacity-40"
                )}
              >
                <div>
                  <p className="font-bold text-white">{step.name}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{step.desc}</p>
                </div>
                <div>
                  {isDone ? (
                    <span className="text-emerald-400">RESOLVED</span>
                  ) : isCurrent ? (
                    isFailed ? (
                      <span className="text-red-400 font-bold">FAILED</span>
                    ) : isRecovering ? (
                      <span className="text-yellow-400 font-bold">RECOVERING...</span>
                    ) : (
                      <span className="text-blue-400 animate-pulse">RUNNING</span>
                    )
                  ) : (
                    <span className="text-zinc-600">QUEUED</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Button onClick={advanceGraph} className="mt-4 bg-red-500 text-white hover:bg-red-600 w-full font-mono text-xs">
          Simulate Next Graph Transition →
        </Button>
      </div>
    );
}

// 4. LIVE RUNTIME CONSOLE SIMULATOR
function ConsoleSim() {
    const [logs, setLogs] = useState<string[]>([
      '[12:20:01] [SYS] Initializing agent shell...',
      '[12:20:01] [AUTH] JWT session verification complete.',
      '[12:20:02] [AGENT] Planner: parsing payload request string...',
      '[12:20:03] [BROWSER] Initializing puppeteer sandbox chromium instance...'
    ]);

    const addLog = () => {
      const extraLogs = [
        '[12:20:04] [BROWSER] GET https://news.ycombinator.com/ resolved (200 OK)',
        '[12:20:05] [EXTRACTOR] Scraped elements into parser buffer.',
        '[12:20:06] [POLICY] Scanning keywords: [ai, autonomous, tech]',
        '[12:20:07] [DATABASE] Writing items to database...',
        '[12:20:08] [SYS] Task ended cleanly. Closing sandbox session.'
      ];

      const currentLength = logs.length - 4;
      if (currentLength < extraLogs.length) {
        setLogs((prev) => [...prev, extraLogs[currentLength]]);
      } else {
        setLogs(logs.slice(0, 4));
      }
    };

    return (
      <div className="flex flex-col justify-between h-full min-h-[300px]">
        <div className="rounded-xl border border-white/5 bg-black/90 p-4 font-mono text-[10px] text-left text-zinc-400 space-y-2 h-[200px] overflow-y-auto scrollbar-thin">
          {logs.map((log, i) => {
            let color = 'text-zinc-400';
            if (log.includes('[SYS]')) color = 'text-blue-400';
            if (log.includes('[AUTH]')) color = 'text-yellow-400';
            if (log.includes('[BROWSER]')) color = 'text-purple-400';
            if (log.includes('[EXTRACTOR]')) color = 'text-emerald-400';
            return <p key={i} className={color}>{log}</p>;
          })}
        </div>
        <Button onClick={addLog} className="mt-4 bg-red-500 text-white hover:bg-red-600 w-full font-mono text-xs">
          {logs.length < 9 ? 'Stream Next Log Entry' : 'Clear Runtime Terminal'}
        </Button>
      </div>
    );
}

// 5. AUTONOMOUS AUTOMATION SIMULATOR
function AutomationSim() {
    const [selectedFlow, setSelectedFlow] = useState('price-monitor');

    const flows: any = {
      'price-monitor': {
        prompt: 'Every morning, scan target competitor site for products and export to Google Sheets.',
        steps: [
          { name: 'Trigger', value: 'Cron job (Daily at 08:00 AM)' },
          { name: 'Agent', value: 'BrowserAgent (Scrapes listings & pricing data)' },
          { name: 'API Action', value: 'Google Sheets API - append rows' },
          { name: 'Alert', value: 'Send Slack confirmation with average price changes' }
        ]
      },
      'lead-sync': {
        prompt: 'Search LinkedIn for CEOs in tech companies, extract email domains, and sync to Salesforce.',
        steps: [
          { name: 'Trigger', value: 'Manual button click or webhook payload' },
          { name: 'Agent', value: 'PlannerAgent (Decomposes targets into dynamic search steps)' },
          { name: 'API Action', value: 'Salesforce Lead API - insert profiles' },
          { name: 'Alert', value: 'Slack channel notifications on sync summary' }
        ]
      }
    };

    return (
      <div className="flex flex-col justify-between h-full min-h-[300px]">
        <div className="text-left space-y-4">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setSelectedFlow('price-monitor')}
              className={cn("px-3 py-1.5 rounded-lg border text-[10px] font-semibold transition-all", selectedFlow === 'price-monitor' ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-white/5 text-zinc-500")}
            >
              Price Monitor Flow
            </button>
            <button
              onClick={() => setSelectedFlow('lead-sync')}
              className={cn("px-3 py-1.5 rounded-lg border text-[10px] font-semibold transition-all", selectedFlow === 'lead-sync' ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-white/5 text-zinc-500")}
            >
              Lead Sync Flow
            </button>
          </div>

          <div className="p-3 rounded-xl border border-white/5 bg-white/[0.01]">
            <p className="text-[10px] text-zinc-500 font-mono">NATURAL LANGUAGE INSTRUCTION</p>
            <p className="text-xs text-zinc-300 mt-1 italic font-medium">"{flows[selectedFlow].prompt}"</p>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] text-zinc-500 font-mono">COMPILER GRAPH DIAGRAM</p>
            {flows[selectedFlow].steps.map((st: any, i: number) => (
              <div key={st.name} className="flex items-center gap-3 font-mono text-xs">
                <span className="w-20 text-zinc-500 text-[10px] uppercase font-bold">{st.name}:</span>
                <span className="text-zinc-300 flex-1 border-b border-dashed border-white/10 pb-0.5">{st.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
}

// 6. REALTIME OBSERVABILITY SIMULATOR
function ObservabilitySim() {
    const [telemetry, setTelemetry] = useState({
      cpu: '24%',
      memory: '482MB',
      latency: '138ms',
      success: '99.4%'
    });

    const randomizeTelemetry = () => {
      setTelemetry({
        cpu: `${Math.floor(Math.random() * 20) + 15}%`,
        memory: `${Math.floor(Math.random() * 50) + 450}MB`,
        latency: `${Math.floor(Math.random() * 40) + 120}ms`,
        success: '99.4%'
      });
    };

    return (
      <div className="flex flex-col justify-between h-full min-h-[300px]">
        <div className="grid grid-cols-2 gap-3 text-left">
          {[
            { label: 'CPU Thread Usage', value: telemetry.cpu, color: 'text-blue-400' },
            { label: 'Active Memory', value: telemetry.memory, color: 'text-purple-400' },
            { label: 'RT Latency', value: telemetry.latency, color: 'text-yellow-400' },
            { label: 'Job Success Margin', value: telemetry.success, color: 'text-emerald-400' },
          ].map((item) => (
            <div key={item.label} className="p-3.5 rounded-xl border border-white/[0.05] bg-white/[0.01]">
              <p className="text-[10px] text-zinc-500 font-mono uppercase">{item.label}</p>
              <p className={cn("text-xl font-bold font-mono mt-1", item.color)}>{item.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-600 font-semibold">Updates: 1s polling</span>
          <Button size="sm" onClick={randomizeTelemetry} className="bg-red-500 text-white hover:bg-red-600 font-mono text-xs">
            Flicker Telemetry Update 🔀
          </Button>
        </div>
      </div>
    );
}

function Metric({
  label,
  value,
  success,
}: {
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/45 px-4 py-3 sm:py-4">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={cn("text-sm font-semibold", success ? "text-emerald-400" : "text-white")}>
        {value}
      </span>
    </div>
  );
}