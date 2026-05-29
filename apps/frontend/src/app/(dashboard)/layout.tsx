'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Cpu } from 'lucide-react';

import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (
      !loading &&
      !user &&
      typeof window !== 'undefined' &&
      !localStorage.getItem('token')
    ) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  /* ===========================================================
     LOADING STATE - On-brand boot sequence
  =========================================================== */
  if (loading) {
    return (
      <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-black">
        {/* Background effects */}
        <div className="absolute inset-0 cyber-grid opacity-10 animate-grid" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-red-500/10 blur-[120px]" />

        {/* Boot sequence card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 flex flex-col items-center"
        >
          {/* Logo with pulse */}
          <div className="relative mb-8">
            <motion.div
              animate={{
                boxShadow: [
                  '0 0 0px rgba(239, 68, 68, 0.4)',
                  '0 0 40px rgba(239, 68, 68, 0.6)',
                  '0 0 0px rgba(239, 68, 68, 0.4)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10"
            >
              <Cpu className="h-10 w-10 text-red-400" />
            </motion.div>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white mb-2">
            OmniTask AI
          </h1>
          <p className="text-xs font-mono text-zinc-600 mb-8 tracking-widest">
            INITIALIZING RUNTIME...
          </p>

          {/* Loading dots */}
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
                className="h-1.5 w-1.5 rounded-full bg-red-500"
              />
            ))}
          </div>

          {/* Boot logs */}
          <div className="mt-10 space-y-1.5 font-mono text-[10px] text-zinc-700">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              → Establishing secure connection...
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              → Verifying authentication tokens...
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              → Loading agent runtime modules...
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
              className="text-emerald-500"
            >
              → Runtime ready
            </motion.p>
          </div>
        </motion.div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}