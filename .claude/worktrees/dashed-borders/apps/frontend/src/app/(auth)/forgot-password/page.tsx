'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

import { Cpu, Loader2, Mail, ArrowLeft, TerminalSquare } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { cn } from '@/lib/utils';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Replace with your actual API endpoint for forgot password
      // await authService.forgotPassword(email);
      await new Promise((r) => setTimeout(r, 1000)); // Mock wait
      setIsSent(true);
      toast.success('Reset protocol initiated. Check your inbox.');
    } catch (error: any) {
      toast.error('Failed to initiate reset protocol.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-black">
      {/* ================================================= */}
      {/* CENTRALLY FLOATING CARD FOR RECOVERY              */}
      {/* ================================================= */}
      <div className="relative flex w-full items-center justify-center p-6">
        {/* Background ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-red-500/10 blur-[100px] pointer-events-none" />
        <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 w-full max-w-[420px] rounded-[28px] border border-white/10 bg-black/40 p-8 backdrop-blur-2xl"
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
              <TerminalSquare className="h-6 w-6 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">System Recovery</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Enter your operator email to override security sequence.
            </p>
          </div>

          {isSent ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center">
              <p className="text-sm text-emerald-400">
                Protocol dispatched to <strong>{email}</strong>. Follow the encrypted link to reset your key.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Operator Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Mail className="h-4 w-4 text-zinc-600" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@omnitask.ai"
                    required
                    className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/40 focus:bg-white/[0.04] focus:outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  'mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200',
                  isLoading 
                    ? 'bg-red-500/50 text-white/50 cursor-not-allowed' 
                    : 'bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/20'
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Transmitting...
                  </>
                ) : (
                  'Send Reset Protocol'
                )}
              </button>
            </form>
          )}

          <div className="mt-8 text-center">
            <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Abort and return to login
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}