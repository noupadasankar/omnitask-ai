'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
// import { authService } from '@/services/auth.service';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Security keys do not match.');
      return;
    }

    if (!token) {
      toast.error('Invalid or expired override token.');
      return;
    }

    setIsLoading(true);

    try {
      // await authService.resetPassword({ token, password });
      await new Promise((r) => setTimeout(r, 1200)); // Mock
      toast.success('Security key updated successfully.');
      router.push('/login');
    } catch (error: any) {
      toast.error('Failed to update security key.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-black">
      <div className="relative flex w-full items-center justify-center p-6">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-red-500/10 blur-[100px] pointer-events-none" />
        <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-[420px] rounded-[28px] border border-white/10 bg-black/40 p-8 backdrop-blur-2xl"
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
              <ShieldCheck className="h-6 w-6 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Set New Key</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Enter your new secure sequence to regain access.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">New Security Key</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Lock className="h-4 w-4 text-zinc-600" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  placeholder="Min 8 characters"
                  required
                  className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/40 focus:bg-white/[0.04] focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Confirm Security Key</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Lock className="h-4 w-4 text-zinc-600" />
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  placeholder="Confirm characters"
                  required
                  className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500/40 focus:bg-white/[0.04] focus:outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200',
                isLoading 
                  ? 'bg-emerald-500/50 text-white/50 cursor-not-allowed' 
                  : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Finalize Configuration'
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}