'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

import { Cpu, Loader2, CheckCircle2, ShieldAlert, ArrowRight } from 'lucide-react';
// import { authService } from '@/services/auth.service';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setStatus('error');
        return;
      }

      try {
        // await authService.verifyEmail(token);
        await new Promise((r) => setTimeout(r, 2000)); // Mocking the verification delay
        setStatus('success');
      } catch (error) {
        setStatus('error');
      }
    };

    verifyToken();
  }, [token]);

  return (
    <div className="flex min-h-screen w-full bg-black">
      <div className="relative flex w-full items-center justify-center p-6">
        {/* Glow adapts to status */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full blur-[100px] pointer-events-none transition-colors duration-1000 ${status === 'success' ? 'bg-emerald-500/20' : status === 'error' ? 'bg-red-500/20' : 'bg-blue-500/10'}`} />
        <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 w-full max-w-[400px] rounded-[28px] border border-white/10 bg-black/40 p-8 backdrop-blur-2xl text-center"
        >
          {status === 'loading' && (
            <div className="flex flex-col items-center py-4">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-500/10 mb-6">
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Verifying Identity</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Checking encrypted clearance codes. Please hold...
              </p>
            </div>
          )}

          {status === 'success' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center py-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 mb-6">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Clearance Granted</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Your email has been verified. You now have full access to the AI runtime environment.
              </p>

              <Link
                href="/login"
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
              >
                Proceed to Login
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center py-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 mb-6">
                <ShieldAlert className="h-10 w-10 text-red-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Verification Failed</h2>
              <p className="mt-2 text-sm text-zinc-400">
                The token is invalid or has expired. Access denied.
              </p>

              <Link
                href="/login"
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-all"
              >
                Return to Login
              </Link>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}