'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

import { Cpu, Loader2, Lock, Mail, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { GoogleButton } from '@/components/auth/GoogleButton';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    if (searchParams.get('error') === 'oauth_failed') {
      toast.error('Google sign-in failed. Please try again or use your password.');
      router.replace('/login');
    }
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(email, password);
      router.push('/dashboard');
      toast.success('Welcome back! Redirecting to dashboard...');
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        (!error?.response
          ? 'Cannot reach the server. Make sure the backend is running on http://localhost:4000.'
          : 'Authentication sequence failed');
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-black">
      {/* ================================================= */}
      {/* LEFT PANE - VISUALS                               */}
      {/* ================================================= */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-white/10 bg-black/50 p-12 lg:flex">
        {/* Background Effects */}
        <div className="absolute inset-0 cyber-grid opacity-20" />
        <div className="absolute -left-[20%] top-[-10%] h-[500px] w-[500px] rounded-full bg-red-500/20 blur-[120px]" />
        
        {/* Top Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10">
            <Cpu className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">OmniTask AI</h1>
            <p className="text-xs text-red-400/80 font-mono">AUTONOMOUS_RUNTIME_OS</p>
          </div>
        </div>

        {/* Bottom Graphic / Text */}
        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[10px] font-mono text-red-300">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse-red" />
            SYSTEM SECURE
          </div>
          <p className="max-w-md text-3xl font-medium leading-tight text-white">
            Orchestrate autonomous agents across your enterprise infrastructure.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
            Access the control center to monitor workflows, approve executions, and observe real-time AI intelligence.
          </p>
        </div>
      </div>

      {/* ================================================= */}
      {/* RIGHT PANE - FORM                                 */}
      {/* ================================================= */}
      <div className="flex w-full items-center justify-center p-8 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-8"
        >
          {/* Mobile Logo Header */}
          <div className="flex flex-col items-center text-center lg:hidden">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
              <Cpu className="h-7 w-7 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">OmniTask AI</h2>
            <p className="mt-2 text-sm text-zinc-400">Sign in to your account</p>
          </div>

          <div className="hidden lg:block text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white">Welcome Back</h2>
            <p className="mt-2 text-sm text-zinc-400">Sign in to your account to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 mt-8">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Mail className="h-4 w-4 text-zinc-600" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/40 focus:bg-white/[0.04] focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400">Password</label>
                <Link href="/forgot-password" className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Lock className="h-4 w-4 text-zinc-600" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 pl-11 pr-11 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/40 focus:bg-white/[0.04] focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-zinc-600 transition-colors hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'group flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200',
                isLoading 
                  ? 'bg-red-500/50 text-white/50 cursor-not-allowed' 
                  : 'bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/20'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* DIVIDER */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">
              or continue with
            </span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          {/* GOOGLE OAUTH */}
          <GoogleButton />

          <p className="text-center text-sm text-zinc-500">
            Don't have an account?{' '}
            <Link href="/register" className="font-semibold text-white hover:text-red-400 transition-colors">
              Create account
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}