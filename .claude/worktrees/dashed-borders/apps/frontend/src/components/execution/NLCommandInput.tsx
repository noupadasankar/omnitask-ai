'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CornerDownLeft, Sparkles, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NLCommandInputProps {
  onSendCommand: (command: string) => void;
  disabled: boolean;
}

export function NLCommandInput({ onSendCommand, disabled }: NLCommandInputProps) {
  const [command, setCommand] = useState('');
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || disabled) return;
    onSendCommand(command.trim());
    setLastCommand(command.trim());
    setCommand('');
  };

  return (
    <div className="relative w-full rounded-2xl border border-white/5 bg-zinc-950/20 p-4 backdrop-blur-2xl transition-all shadow-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {/* Input Bar */}
        <div className="relative flex items-center gap-3 rounded-xl border border-white/10 bg-black/60 p-2 pl-4 focus-within:border-red-500/30 focus-within:shadow-[0_0_15px_rgba(239,68,68,0.1)] transition-all">
          <Sparkles className="h-4 w-4 text-red-500 flex-shrink-0 animate-pulse" />
          
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={disabled}
            placeholder="Intervene in execution... (e.g., 'skip this step', 'choose cheaper option')"
            className="flex-1 bg-transparent text-xs font-semibold text-white outline-none placeholder-zinc-500 disabled:opacity-40"
          />

          <button
            type="submit"
            disabled={!command.trim() || disabled}
            className="h-8 px-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 flex items-center justify-center gap-1.5 text-[10px] font-bold text-zinc-400 hover:text-white transition-all active:scale-95 disabled:opacity-40"
          >
            SEND INTERRUPT
            <CornerDownLeft className="h-3 w-3 text-zinc-500" />
          </button>
        </div>

        {/* Dynamic prompt overlay on last command dispatched */}
        <AnimatePresence>
          {lastCommand && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 0.6, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-[10px] font-mono text-zinc-500 flex items-center gap-2 pl-2"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              LAST COMMAND DISPATCHED: "{lastCommand}" (Adapted constraints updated)
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
