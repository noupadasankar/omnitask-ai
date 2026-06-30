'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Loader2 } from 'lucide-react';
import { refineGoal } from '@/services/agent.service';

interface ClarificationModalProps {
  open: boolean;
  questions: string[];
  parsedGoal: any;
  goalText: string;
  onClose: () => void;
  onResolved: (refinedGoal: any, refinedText: string) => void;
}

export function ClarificationModal({
  open,
  questions,
  parsedGoal,
  goalText,
  onClose,
  onResolved,
}: ClarificationModalProps) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!answer.trim() || !parsedGoal || submitting) return;
    setSubmitting(true);
    try {
      const refined = await refineGoal(parsedGoal, answer.trim());
      const refinedText = refined.intent || goalText;
      onResolved(refined, refinedText);
      setAnswer('');
    } catch (err) {
      console.error('Clarification failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && questions.length > 0 && (
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
            className="w-full max-w-lg overflow-hidden rounded-[28px] border border-amber-500/20 bg-zinc-950 shadow-2xl"
          >
            <div className="border-b border-white/[0.06] bg-amber-500/[0.03] px-6 py-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Need More Information</h3>
                <p className="text-xs text-zinc-500 font-mono">CLARIFICATION REQUIRED BEFORE EXECUTION</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-zinc-400">
                Your goal needs a few details before the agent can plan safely.
              </p>
              <ul className="space-y-2">
                {questions.map((q, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-zinc-200"
                  >
                    <span className="text-amber-400 font-mono text-xs mt-0.5">{idx + 1}.</span>
                    {q}
                  </li>
                ))}
              </ul>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Answer all questions above..."
                rows={3}
                className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/30"
              />
            </div>

            <div className="px-6 pb-6 pt-2 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm font-bold text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!answer.trim() || submitting}
                className="flex-1 h-11 rounded-xl bg-amber-500 text-sm font-bold text-black shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
