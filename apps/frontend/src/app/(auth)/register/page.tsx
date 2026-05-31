'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

import { Cpu, Loader2, Lock, Mail, User, ShieldCheck } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await authService.register({ name, email, password });
      localStorage.setItem('token', res.data.accessToken);
      setUser(res.data.user);
      toast.success('Identity verified. Access granted.');
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Registration sequence failed');
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
        <div className="absolute inset-0 cyber-grid opacity-20" />
        <div className="absolute -left-[20%] top-[-10%] h-[500px] w-[500px] rounded-full bg-red-500/20 blur-[120px]" />
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10">
            <Cpu className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">OmniTask AI</h1>
            <p className="text-xs text-red-400/80 font-mono">AUTONOMOUS_RUNTIME_OS</p>
          </div>
        </div>

        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono text-emerald-400">
            <ShieldCheck className="h-3 w-3" />
            NEW_OPERATOR_CLEARANCE
          </div>
          <p className="max-w-md text-3xl font-medium leading-tight text-white">
            Join the most advanced autonomous orchestration engine.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
            Configure your admin profile to start building, deploying, and monitoring AI task clusters.
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
          <div className="flex flex-col items-center text-center lg:hidden">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
              <Cpu className="h-7 w-7 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Create Account</h2>
          </div>

          <div className="hidden lg:block text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white">Request Access</h2>
            <p className="mt-2 text-sm text-zinc-400">Create your operator profile.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mt-8">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <User className="h-4 w-4 text-zinc-600" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="System Operator"
                  required
                  className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/40 focus:bg-white/[0.04] focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Email Address</label>
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

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Security Key (Password)</label>
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
                  ? 'bg-white/10 text-white/50 cursor-not-allowed' 
                  : 'bg-white text-black hover:bg-zinc-200 shadow-lg'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Identity...
                </>
              ) : (
                'Create Identity'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-zinc-500">
            Already cleared?{' '}
            <Link href="/login" className="font-semibold text-white hover:text-red-400 transition-colors">
              Initialize session
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}