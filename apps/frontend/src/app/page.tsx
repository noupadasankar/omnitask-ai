'use client';

import Link from 'next/link';

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
} from 'lucide-react';

import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';

const features = [
  {
    icon: BrainCircuit,
    title: 'Multi-Agent Intelligence',
    description:
      'Planner, Browser, API, and Supervisor agents coordinate autonomously.',
  },
  {
    icon: ShieldCheck,
    title: 'Human Approval Layer',
    description:
      'Critical actions require approval before execution for enterprise safety.',
  },
  {
    icon: Workflow,
    title: 'Execution Graph Engine',
    description:
      'Visual orchestration system with retries, checkpoints, and recovery.',
  },
  {
    icon: Terminal,
    title: 'Live Runtime Console',
    description:
      'Observe agents executing tasks in real time with structured logs.',
  },
  {
    icon: Cpu,
    title: 'Autonomous Automation',
    description:
      'Natural language workflows executed across browsers, APIs, and files.',
  },
  {
    icon: Activity,
    title: 'Realtime Observability',
    description:
      'Metrics, traces, execution history, and runtime health monitoring.',
  },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      {/* ===================================================== */}
      {/* NAVBAR */}
      {/* ===================================================== */}

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          {/* LOGO */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 red-glow">
              <Bot className="h-6 w-6 text-red-400" />
            </div>

            <div>
              <h1 className="text-lg font-semibold tracking-wide">
                OmniTask AI
              </h1>

              <p className="text-xs text-zinc-500">
                Autonomous Operations
              </p>
            </div>
          </div>

          {/* NAV */}
          <div className="hidden items-center gap-10 md:flex">
            <a
              href="#features"
              className="text-sm text-zinc-400 transition hover:text-white"
            >
              Features
            </a>

            <a
              href="#architecture"
              className="text-sm text-zinc-400 transition hover:text-white"
            >
              Architecture
            </a>

            <a
              href="#execution"
              className="text-sm text-zinc-400 transition hover:text-white"
            >
              Execution
            </a>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button
                variant="ghost"
                className="border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.05]"
              >
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

          <span className="text-gradient">
            Actually Execute
          </span>
        </motion.h1>

        {/* DESCRIPTION */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 max-w-3xl text-lg leading-relaxed text-zinc-400 md:text-xl"
        >
          OmniTask AI orchestrates autonomous agents that
          plan, reason, browse, automate, validate, and
          complete real-world workflows across browsers,
          APIs, and enterprise systems.
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

          <Button
            variant="ghost"
            className="h-14 rounded-2xl border border-white/10 bg-white/[0.03] px-8 text-base text-zinc-300 hover:bg-white/[0.05]"
          >
            Watch Demo
          </Button>
        </motion.div>

        {/* EXECUTION PANEL */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-24 w-full max-w-6xl"
        >
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-xl">
            {/* TOP */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                </div>

                <span className="terminal-text text-sm text-zinc-500">
                  autonomous-runtime.console
                </span>
              </div>

              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                LIVE
              </div>
            </div>

            {/* CONTENT */}
            <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
              {/* LEFT */}
              <div className="border-b border-white/10 p-6 lg:border-b-0 lg:border-r">
                <div className="mb-6 flex items-center gap-3">
                  <div className="animate-pulse-red h-3 w-3 rounded-full bg-red-500" />

                  <span className="terminal-text text-sm text-zinc-400">
                    Executing autonomous workflow
                  </span>
                </div>

                <div className="space-y-3 font-mono text-sm">
                  <p className="text-zinc-500">
                    → Initializing PlannerAgent...
                  </p>

                  <p className="text-zinc-500">
                    → Building execution graph...
                  </p>

                  <p className="text-zinc-500">
                    → Launching BrowserAgent...
                  </p>

                  <p className="text-zinc-500">
                    → Policy validation passed...
                  </p>

                  <p className="text-zinc-500">
                    → Executing LinkedIn workflow...
                  </p>

                  <p className="text-emerald-400">
                    → Task execution successful
                  </p>
                </div>
              </div>

              {/* RIGHT */}
              <div className="p-6">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-zinc-300">
                    Runtime Metrics
                  </h3>

                  <div className="rounded-full bg-red-500/10 px-2 py-1 text-xs text-red-300">
                    Active
                  </div>
                </div>

                <div className="space-y-4">
                  <Metric
                    label="Active Agents"
                    value="04"
                  />

                  <Metric
                    label="Queue Depth"
                    value="12"
                  />

                  <Metric
                    label="Execution Success"
                    value="98.2%"
                  />

                  <Metric
                    label="Runtime Health"
                    value="Operational"
                    success
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ===================================================== */}
      {/* FEATURES */}
      {/* ===================================================== */}

      <section
        id="features"
        className="mx-auto max-w-7xl px-6 py-32"
      >
        <div className="mb-20 text-center">
          <div className="mb-4 inline-flex rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            Platform Capabilities
          </div>

          <h2 className="text-4xl font-bold md:text-5xl">
            Built for Autonomous Execution
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-500">
            Enterprise-grade orchestration layer for AI
            agents operating across browsers, APIs, files,
            and workflows.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;

            return (
              <motion.div
                key={feature.title}
                initial={{
                  opacity: 0,
                  y: 20,
                }}
                whileInView={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  delay: index * 0.05,
                }}
                viewport={{ once: true }}
                className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl transition-all duration-300 hover:border-red-500/20 hover:bg-red-500/[0.03]"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400">
                  <Icon className="h-7 w-7" />
                </div>

                <h3 className="mb-3 text-xl font-semibold">
                  {feature.title}
                </h3>

                <p className="leading-relaxed text-zinc-500">
                  {feature.description}
                </p>

                <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-red-500/10 blur-3xl" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ===================================================== */}
      {/* FOOTER */}
      {/* ===================================================== */}

      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-red-400" />

            <span className="font-medium">
              OmniTask AI
            </span>
          </div>

          <p className="text-sm text-zinc-500">
            Autonomous AI Execution Platform © 2026
          </p>

          <div className="flex items-center gap-3 text-zinc-500">
            <Command className="h-4 w-4" />

            <span className="text-sm">
              Mission Control for AI Agents
            </span>
          </div>
        </div>
      </footer>
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
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
      <span className="text-sm text-zinc-500">
        {label}
      </span>

      <span
        className={`text-sm font-semibold ${
          success
            ? 'text-emerald-400'
            : 'text-white'
        }`}
      >
        {value}
      </span>
    </div>
  );
}