'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Plus, ToggleLeft, ToggleRight, Trash2, Cpu, ArrowLeft, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule } from '@/services/agent.service';

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // New schedule fields
  const [name, setName] = useState('');
  const [cronExpression, setCronExpression] = useState('0 9 * * 1-5'); // Daily at 9 AM weekdays
  const [goal, setGoal] = useState('');

  useEffect(() => {
    async function load() {
      setError(null);
      try {
        const data = await getSchedules();
        setSchedules(data);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Failed to load schedules');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateSchedule(id, { enabled: !enabled });
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: !enabled } : s))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !cronExpression.trim() || !goal.trim()) return;
    setFormError(null);
    try {
      const data = await createSchedule({
        name: name.trim(),
        cronExpression: cronExpression.trim(),
        goal: goal.trim(),
        config: {},
      });
      setSchedules((prev) => [data, ...prev]);
      setName('');
      setGoal('');
      setShowAddForm(false);
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create schedule');
    }
  };

  return (
    <div className="relative flex flex-col gap-6 p-6 min-h-screen text-white bg-black">
      <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />

      {/* Header Banner */}
      <header className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-wider text-white">Schedules Control Room</h1>
            <p className="text-[10px] font-mono text-zinc-500 tracking-widest mt-0.5">RECURRING WORKFLOW TRIGGERS</p>
          </div>
        </div>

        <Link href="/dashboard">
          <button className="h-9 px-4 rounded-xl border border-red-500/25 bg-red-500/10 text-xs font-bold font-mono text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            MISSION CONTROL
          </button>
        </Link>
      </header>

      {/* Add Schedule Toggle Button */}
      <section className="relative z-10 flex justify-between items-center p-4 rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl">
        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Active Scheduled Cron Triggers</span>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="h-9 px-4 rounded-xl bg-red-500 text-xs font-bold text-white transition-all hover:scale-105 hover:shadow-[0_0_10px_rgba(239,68,68,0.4)] flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          NEW TRIGGER SCHEDULE
        </button>
      </section>

      {/* Form Overlay */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-10 overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="p-6 rounded-3xl border border-white/10 bg-zinc-950/40 backdrop-blur-2xl space-y-4 max-w-xl mx-auto shadow-2xl">
              <h3 className="text-xs font-mono font-bold text-red-400 tracking-widest uppercase">Configure Trigger Schedule</h3>
              
              <div className="space-y-3">
                {/* 1. Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-zinc-500">TRIGGER NAME</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Daily Biryani Order Check"
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-xs font-semibold text-white outline-none focus:border-red-500/30"
                  />
                </div>

                {/* 2. Cron */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-zinc-500">CRON EXPRESSION</label>
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-xs font-semibold text-white outline-none font-mono focus:border-red-500/30"
                  />
                </div>

                {/* 3. Goal Prompt */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-zinc-500">RUN PROMPT GOAL</label>
                  <textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="e.g. Compare pricing for flight ticket from Bangalore to Mumbai on MakeMyTrip"
                    className="w-full h-24 rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-xs font-semibold text-white outline-none focus:border-red-500/30 resize-none"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
                  <p className="text-[11px] text-red-400">{formError}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setFormError(null); }}
                  className="h-9 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-xs font-bold text-zinc-400 hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 rounded-xl bg-red-500 text-xs font-bold text-white hover:scale-105 transition-all"
                >
                  DEPLOY SCHEDULE
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schedules grid list */}
      <section className="relative z-10 flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Cpu className="h-8 w-8 text-red-500 animate-spin mb-3" />
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">LOADING CRON CHANNELS...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500/60 mb-3" />
            <span className="text-xs font-mono text-red-400 uppercase tracking-wider">{error}</span>
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center border border-white/5 rounded-3xl bg-zinc-950/20 py-24">
            <Calendar className="h-10 w-10 text-zinc-700 mb-3" />
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">No recurring schedules configured</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {schedules.map((item) => {
              const runGoal = (item.taskTemplate as any)?.goal || 'Scheduled objective';

              return (
                <motion.div
                  key={item.id}
                  whileHover={{ y: -2 }}
                  className="rounded-3xl border border-white/5 bg-zinc-950/40 p-5 flex flex-col justify-between min-h-[180px] transition-all hover:border-white/10 relative overflow-hidden"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-bold text-white leading-snug">{item.name}</h3>

                      {/* Toggle button */}
                      <button
                        onClick={() => handleToggle(item.id, item.enabled)}
                        className="text-zinc-500 hover:text-white transition-all"
                      >
                        {item.enabled ? (
                          <ToggleRight className="h-8 w-8 text-red-500 animate-pulse" />
                        ) : (
                          <ToggleLeft className="h-8 w-8 text-zinc-600" />
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-zinc-400 font-semibold leading-relaxed font-sans">{runGoal}</p>

                    {/* Cron string */}
                    <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 bg-black/40 border border-white/5 rounded px-2.5 py-1.5 w-fit">
                      <Clock className="h-3.5 w-3.5" />
                      <span>CRON: "{item.cronExpression}"</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-4 text-[10px] font-mono text-zinc-500">
                    <div>
                      <div>RUNS: {item.runCount || 0} | FAILS: {item.failCount || 0}</div>
                    </div>

                    <button
                      onClick={() => handleDelete(item.id)}
                      className="h-8 w-8 flex items-center justify-center rounded border border-white/5 bg-white/[0.02] text-zinc-500 hover:text-red-400 hover:bg-white/[0.05] transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
