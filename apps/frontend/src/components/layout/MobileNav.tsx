'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  X,
  Cpu,
  LayoutDashboard,
  ListTodo,
  Bot,
  GitBranch,
  ShieldCheck,
  History,
  Activity,
  BrainCircuit,
  BarChart3,
  Settings,
  Shield,
  LogOut,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { cn, getInitials } from '@/lib/utils';

/* ===========================================================
   MOBILE NAV STRUCTURE
=========================================================== */

const NAV_GROUPS = [
  {
    label: 'Core',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Tasks', href: '/tasks', icon: ListTodo, badge: '3' },
      { title: 'Agents', href: '/agents', icon: Bot },
      { title: 'Workflows', href: '/workflows', icon: GitBranch },
      { title: 'Approvals', href: '/approvals', icon: ShieldCheck, badge: '2', urgent: true },
    ],
  },
  {
    label: 'Observability',
    items: [
      { title: 'History', href: '/history', icon: History },
      { title: 'Analytics', href: '/analytics', icon: BarChart3 },
      { title: 'Health', href: '/health', icon: Activity },
      { title: 'Memory', href: '/memory', icon: BrainCircuit },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Settings', href: '/settings', icon: Settings },
      { title: 'Admin', href: '/admin', icon: Shield },
    ],
  },
];

/* ===========================================================
   COMPONENT
=========================================================== */

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {/* =========== TRIGGER (only mobile) =========== */}
      <button
        onClick={() => setOpen(true)}
        className="
          flex h-9 w-9 items-center justify-center rounded-xl 
          border border-white/[0.07] bg-white/[0.02] text-zinc-400 
          transition-all hover:bg-white/[0.05] hover:text-white
          lg:hidden
        "
        aria-label="Open menu"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      {/* =========== DRAWER =========== */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm lg:hidden"
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="
                fixed left-0 top-0 bottom-0 z-[70] flex w-[300px] flex-col 
                border-r border-white/10 bg-black/95 backdrop-blur-2xl lg:hidden
              "
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 h-[64px] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10">
                    <Cpu className="h-[18px] w-[18px] text-red-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-black tracking-tight text-white leading-none">
                      OmniTask AI
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-1 leading-none">
                      Runtime OS
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/[0.05] hover:text-white transition-all"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* ================================================= */}
              {/* LEFT: WORKSPACE CONTEXT                           */}
              {/* ================================================= */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-[13px]">
                  {/* workspace context placeholder */}
                </div>
              </div>
              {/* Nav Groups */}
              <nav className="flex-1 overflow-y-auto py-4 space-y-5">
                {NAV_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="px-5 mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
                      {group.label}
                    </p>

                    <div className="space-y-0.5 px-3">
                      {group.items.map((item) => {
                        const isActive =
                          pathname === item.href ||
                          (item.href !== '/dashboard' && pathname.startsWith(item.href));
                        const Icon = item.icon;

                        return (
                          <Link key={item.href} href={item.href}>
                            <div
                              className={cn(
                                'relative flex items-center h-10 rounded-xl cursor-pointer transition-all',
                                isActive
                                  ? 'bg-red-500/10 border border-red-500/15'
                                  : 'border border-transparent hover:bg-white/[0.04]',
                              )}
                            >
                              {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-red-500" />
                              )}

                              <div className="flex items-center justify-center w-10 h-10 flex-shrink-0">
                                <Icon
                                  className={cn(
                                    'h-[17px] w-[17px]',
                                    isActive ? 'text-red-400' : 'text-zinc-500',
                                  )}
                                />
                              </div>

                              <span
                                className={cn(
                                  'text-[13px] font-medium flex-1',
                                  isActive ? 'text-white' : 'text-zinc-400',
                                )}
                              >
                                {item.title}
                              </span>

                              {item.badge && (
                                <span
                                  className={cn(
                                    'mr-3 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                                    item.urgent
                                      ? 'bg-red-500/20 text-red-300'
                                      : 'bg-white/10 text-zinc-400',
                                  )}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Footer - User */}
              <div className="flex-shrink-0 border-t border-white/[0.06] p-3">
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-[11px] font-bold text-red-300">
                    {getInitials(user?.name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-white truncate">
                      {user?.name || 'Operator'}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {user?.email || 'admin@runtime.ai'}
                    </p>
                  </div>

                  <button
                    onClick={logout}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-red-500/10 hover:text-red-400"
                    title="Logout"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Runtime Status */}
                <div className="mt-3 flex items-center gap-2 px-1">
                  <div className="relative">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    Runtime active · 4 agents · 12 tasks
                  </p>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}