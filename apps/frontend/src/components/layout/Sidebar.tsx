'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Cpu, PanelLeft, LogOut, Shield } from 'lucide-react';
import { navigation, adminNavigation } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { useRuntimeStore } from '@/store/runtime.store';
import { useAuth } from '@/hooks/useAuth';

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { sidebarOpen, toggleSidebar } = useRuntimeStore();
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <aside className="hidden lg:flex h-screen w-[64px] flex-col border-r border-white/10 bg-black/40 backdrop-blur-2xl flex-shrink-0 z-30" />
    );
  }

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'hidden lg:flex h-screen flex-col border-r border-white/10 bg-black/40 backdrop-blur-2xl transition-all duration-300 ease-in-out flex-shrink-0 z-30 overflow-hidden',
        sidebarOpen ? 'w-[280px]' : 'w-[64px]'
      )}
    >

      {/* ===================================================
          HEADER — switches between PanelLeft icon (closed)
          and logo + close button (open)
      =================================================== */}
      <div className="relative flex h-20 flex-shrink-0 items-center border-b border-white/10">

        {/* CLOSED: Cpu by default, PanelLeft on hover — click to open */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-200',
            sidebarOpen ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 pointer-events-auto scale-100'
          )}
        >
          <motion.button
            onClick={toggleSidebar}
            whileTap={{ scale: 0.86 }}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-200 focus:outline-none relative overflow-hidden',
              hovered
                ? 'border-white/20 bg-white/[0.06] text-zinc-300'
                : 'border-red-500/20 bg-red-500/10 text-red-400'
            )}
            aria-label="Open sidebar"
          >
            <Cpu className={cn('h-5 w-5 absolute transition-all duration-200', hovered ? 'opacity-0 scale-75' : 'opacity-100 scale-100')} />
            <PanelLeft className={cn('h-5 w-5 absolute transition-all duration-200', hovered ? 'opacity-100 scale-100' : 'opacity-0 scale-75')} />
          </motion.button>
        </div>

        {/* OPEN: Logo on left, mirrored PanelLeft to close on right */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-between px-4 transition-all duration-200',
            sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
              <Cpu className="h-5 w-5 text-red-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-black tracking-wider uppercase text-white leading-none truncate">
                OmniTask AI
              </span>
              <span className="text-[10px] text-zinc-500 mt-0.5 font-mono tracking-widest leading-none">
                RUNTIME OS
              </span>
            </div>
          </div>

          {/* Close button — PanelLeft mirrored = points right to close */}
          <motion.button
            onClick={toggleSidebar}
            whileTap={{ scale: 0.86 }}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 focus:outline-none"
            aria-label="Collapse sidebar"
          >
            <span className="flex" style={{ transform: 'scaleX(-1)' }}>
              <PanelLeft className="h-4 w-4" />
            </span>
          </motion.button>
        </div>
      </div>

      {/* ===================================================
          NAVIGATION
      =================================================== */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-1">
        {(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN')
          ? adminNavigation.map((item) => (
              <NavItem key={item.title} item={item} pathname={pathname} sidebarOpen={sidebarOpen} admin />
            ))
          : navigation.map((item) => (
              <NavItem key={item.title} item={item} pathname={pathname} sidebarOpen={sidebarOpen} />
            ))
        }
      </div>

      {/* ===================================================
          STATUS STRIP — only when open
      =================================================== */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="px-3 py-2"
          >
            <div className="flex items-center justify-center h-9 px-3">
              <span className="text-[10px] font-mono font-bold tracking-wider text-zinc-600">
                v1.0.0
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================================================
          PROFILE FOOTER
      =================================================== */}
      <div className="border-t border-white/10 flex-shrink-0">
        {sidebarOpen ? (
          /* EXPANDED — full profile card */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="p-3"
          >
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/30 to-red-600/10 border border-red-500/20 text-sm font-black text-red-300 uppercase">
                    {user?.name?.[0] || 'A'}
                  </div>
                  {(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') && (
                    <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/20">
                      <Shield className="h-2.5 w-2.5 text-amber-400" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-white truncate">
                      {user?.name || 'Operator'}
                    </p>
                    {(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') && (
                      <span className="flex-shrink-0 rounded px-1 py-0.5 text-[8px] font-black tracking-wider border border-amber-500/30 bg-amber-500/10 text-amber-400">
                        {user.role === 'SUPERADMIN' ? 'SUPER' : 'ADMIN'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate">
                    {user?.email || 'admin@runtime.ai'}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="flex-shrink-0 flex items-center justify-center gap-1.5 h-8 px-3 rounded-xl border border-red-500/15 bg-red-500/5 text-[10px] font-medium text-red-400 transition-all hover:bg-red-500/10"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          /* COLLAPSED — avatar initial as hint button */
          <div className="flex justify-center p-3">
            <button
              onClick={toggleSidebar}
              title={user?.name || 'Open sidebar'}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/5 border border-red-500/15 text-sm font-black text-red-300 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
            >
              {user?.name?.[0]?.toUpperCase() || 'A'}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── Reusable nav item ──────────────────────────────────────── */
function NavItem({
  item,
  pathname,
  sidebarOpen,
  admin = false,
}: {
  item: { title: string; href: string; icon: any; description?: string };
  pathname: string;
  sidebarOpen: boolean;
  admin?: boolean;
}) {
  const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href) && item.href.startsWith('/admin'));
  const Icon = item.icon;

  return (
    <Link href={item.href}>
      <motion.div
        whileHover={{ x: sidebarOpen ? 3 : 0, scale: sidebarOpen ? 1 : 1.05 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'group relative flex items-center rounded-2xl border transition-all duration-200',
          sidebarOpen
            ? 'h-14 px-3 gap-3 justify-between'
            : 'h-11 w-11 mx-auto justify-center rounded-xl',
          active
            ? admin
              ? 'border-amber-500/25 bg-amber-500/10'
              : 'border-red-500/20 bg-red-500/10'
            : 'border-transparent hover:border-white/10 hover:bg-white/[0.03]'
        )}
      >
        <div className={cn(
          'flex flex-shrink-0 items-center justify-center rounded-xl transition-all',
          sidebarOpen ? 'h-10 w-10' : 'h-7 w-7',
          active
            ? admin ? 'text-amber-400' : 'text-red-400'
            : 'text-zinc-500 group-hover:text-white'
        )}>
          <Icon className="h-5 w-5" />
        </div>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col min-w-0"
            >
              <p className={cn(
                'text-xs font-semibold truncate',
                active
                  ? admin ? 'text-amber-300' : 'text-white'
                  : 'text-zinc-400 group-hover:text-zinc-200'
              )}>
                {item.title}
              </p>
              <p className="text-[10px] text-zinc-600 truncate mt-0.5">
                {item.description || 'Module'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.1 }}
            >
              <ChevronRight className={cn(
                'h-4 w-4 flex-shrink-0',
                active
                  ? admin ? 'text-amber-400 opacity-100' : 'text-red-400 opacity-100'
                  : 'text-zinc-700 opacity-0 group-hover:opacity-100'
              )} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Link>
  );
}
