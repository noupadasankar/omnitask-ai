'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Cpu, Loader2, ShieldAlert } from 'lucide-react';

import { useAuthStore } from '@/store/auth.store';

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get('token');
    const oauthError = searchParams.get('error');

    if (oauthError || !token) {
      setError(
        oauthError === 'oauth_failed'
          ? 'Google sign-in was rejected or failed. Please try again.'
          : 'No authentication token received from the provider.',
      );
      const t = setTimeout(() => router.replace('/login?error=oauth_failed'), 2200);
      return () => clearTimeout(t);
    }

    localStorage.setItem('token', token);

    (async () => {
      await fetchUser();
      router.replace('/dashboard');
    })();
  }, [searchParams, fetchUser, router]);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
      <div className="absolute inset-0 cyber-grid opacity-20" />
      <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/15 blur-[130px]" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 flex flex-col items-center text-center"
      >
        <div
          className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border ${
            error
              ? 'border-red-500/30 bg-red-500/10'
              : 'border-red-500/30 bg-red-500/10'
          }`}
        >
          {error ? (
            <ShieldAlert className="h-8 w-8 text-red-400" />
          ) : (
            <Cpu className="h-8 w-8 text-red-400" />
          )}
        </div>

        {error ? (
          <>
            <h1 className="text-xl font-bold text-white">Sign-in failed</h1>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">{error}</p>
            <p className="mt-4 text-xs font-mono text-zinc-600">
              Redirecting you back to login...
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-white">Finalizing sign-in</h1>
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-red-400" />
              Verifying your Google identity...
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
