'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Command,
  Search,
  LogOut,
  Settings as SettingsIcon,
  ChevronDown,
  Activity,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Zap,
  Clock,
  Trash2,
  Check,
  BrainCircuit,
  Bot,
  X,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { MobileNav } from './MobileNav';

/* ================================================================
   NOTIFICATION TYPES
================================================================ */

type NotifType = 'success' | 'error' | 'warning' | 'info' | 'agent' | 'system';

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'success',
    title: 'Task Completed',
    message: 'BrowserAgent successfully scraped 142 product listings from Amazon.',
    timestamp: new Date(Date.now() - 2 * 60 * 1000),
    read: false,
  },
  {
    id: '2',
    type: 'agent',
    title: 'Agent Awaiting Approval',
    message: 'ExecutionCore requires human clearance before submitting outbound email.',
    timestamp: new Date(Date.now() - 8 * 60 * 1000),
    read: false,
  },
  {
    id: '3',
    type: 'warning',
    title: 'Rate Limit Detected',
    message: 'LinkedIn scraping hit rate limit. Agent auto-rotated proxy and retried.',
    timestamp: new Date(Date.now() - 22 * 60 * 1000),
    read: false,
  },
  {
    id: '4',
    type: 'error',
    title: 'Task Failed',
    message: 'PlannerAgent could not decompose goal: "Book tickets for March". Retry suggested.',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    read: true,
  },
  {
    id: '5',
    type: 'system',
    title: 'Runtime Health: Optimal',
    message: 'All system components nominal. Queue depth: 0. Uptime: 99.98%.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    read: true,
  },
  {
    id: '6',
    type: 'info',
    title: 'New Skill Promoted',
    message: '"Daily Competitor Price Monitor" workflow promoted to Skill Library.',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    read: true,
  },
];

/* ================================================================
   HELPERS
================================================================ */

function relativeTime(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const NOTIF_CONFIG: Record<
  NotifType,
  { icon: React.ReactNode; color: string; bg: string; border: string; dot: string }
> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  error: {
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    dot: 'bg-red-500',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    dot: 'bg-yellow-500',
  },
  info: {
    icon: <Info className="h-4 w-4" />,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    dot: 'bg-blue-500',
  },
  agent: {
    icon: <BrainCircuit className="h-4 w-4" />,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    dot: 'bg-purple-500',
  },
  system: {
    icon: <Zap className="h-4 w-4" />,
    color: 'text-zinc-400',
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/20',
    dot: 'bg-zinc-500',
  },
};

/* ================================================================
   NOTIFICATION PANEL COMPONENT
================================================================ */

function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const displayed = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const markRead = (id: string) =>
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

  const dismiss = (id: string) =>
    setNotifications((prev) => prev.filter((n) => n.id !== id));

  const clearAll = () => setNotifications([]);

  return (
    <div className="relative" ref={panelRef}>
      {/* BELL TRIGGER */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`
          relative flex h-12 w-12 items-center justify-center rounded-2xl border
          transition-all duration-200 focus:outline-none
          ${
            open
              ? 'border-red-500/40 bg-red-500/10 text-red-400'
              : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
          }
        `}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />

        {/* UNREAD BADGE */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.div
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white shadow-lg shadow-red-500/40 ring-2 ring-black"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* FULL-SCREEN BACKDROP OVERLAY */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="notification-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* NOTIFICATION DROPDOWN */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="
              absolute right-0 mt-3 w-[390px] origin-top-right
              rounded-2xl border border-white/10 bg-zinc-950
              shadow-2xl shadow-black/80 z-50
              overflow-hidden
            "
          >
            {/* HEADER */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20">
                  <Bell className="h-3.5 w-3.5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Notifications</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {unreadCount > 0 ? `${unreadCount} unread events` : 'All caught up'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-zinc-400 transition-all hover:bg-white/[0.06] hover:text-white"
                  >
                    <Check className="h-3 w-3" />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-zinc-500 transition-all hover:bg-white/[0.06] hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* FILTER TABS */}
            <div className="flex gap-1 border-b border-white/[0.06] px-4 py-2">
              {(['all', 'unread'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`
                    relative rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all capitalize
                    ${
                      filter === tab
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }
                  `}
                >
                  {tab}
                  {tab === 'unread' && unreadCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-black text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* NOTIFICATION LIST */}
            <div className="max-h-[380px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                    <Bell className="h-5 w-5 text-zinc-600" />
                  </div>
                  <p className="text-sm font-medium text-zinc-500">No notifications</p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {filter === 'unread' ? 'All events have been read.' : 'Agent activity will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {displayed.map((notif, i) => {
                    const cfg = NOTIF_CONFIG[notif.type];
                    return (
                      <motion.div
                        key={notif.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10, height: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`
                          group relative flex gap-3 px-4 py-3.5 transition-all cursor-pointer
                          ${!notif.read ? 'bg-white/[0.015]' : ''}
                          hover:bg-white/[0.03]
                        `}
                        onClick={() => markRead(notif.id)}
                      >
                        {/* UNREAD INDICATOR */}
                        {!notif.read && (
                          <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r ${cfg.dot}`} />
                        )}

                        {/* ICON */}
                        <div className={`
                          mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border
                          ${cfg.color} ${cfg.bg} ${cfg.border}
                        `}>
                          {cfg.icon}
                        </div>

                        {/* CONTENT */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-xs font-semibold leading-tight ${!notif.read ? 'text-white' : 'text-zinc-300'}`}>
                              {notif.title}
                            </p>
                            <div className="flex flex-shrink-0 items-center gap-1.5">
                              <span className="text-[9px] font-mono text-zinc-600 whitespace-nowrap">
                                {relativeTime(notif.timestamp)}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismiss(notif.id);
                                }}
                                className="hidden h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.02] text-zinc-600 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:flex"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 line-clamp-2">
                            {notif.message}
                          </p>

                          {/* TYPE BADGE */}
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className={`
                              inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border
                              ${cfg.color} ${cfg.bg} ${cfg.border}
                            `}>
                              {cfg.icon && <span className="scale-75">{cfg.icon}</span>}
                              {notif.type}
                            </span>
                            {!notif.read && (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white/[0.04] text-zinc-500 border border-white/[0.06]">
                                <div className={`h-1.5 w-1.5 rounded-full ${cfg.dot} animate-pulse`} />
                                NEW
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* FOOTER */}
            {notifications.length > 0 && (
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
                <p className="text-[10px] text-zinc-600 font-mono">
                  {notifications.length} total events
                </p>
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[10px] font-semibold text-red-400 transition-all hover:bg-red-500/10"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear all
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================
   TOPBAR
================================================================ */

export function Topbar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-white/10 bg-black/40 px-6 backdrop-blur-2xl">

      {/* LEFT — Search */}
      <div className="flex items-center gap-4">
        <MobileNav />
        <div className="hidden md:flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            placeholder="Search runtime..."
            className="bg-transparent text-sm text-white outline-none placeholder:text-zinc-600 w-44"
          />
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-zinc-500">
            <Command className="h-3 w-3" />
            K
          </div>
        </div>
      </div>

      {/* RIGHT — Notifications + Profile */}
      <div className="flex items-center gap-3">

        {/* ADVANCED NOTIFICATION PANEL */}
        <NotificationPanel />

        {/* PROFILE DROPDOWN — avatar only, no name */}
        <div className="relative" ref={dropdownRef}>

          {/* TRIGGER — avatar initial only */}
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`
              flex items-center justify-center
              h-12 w-12 rounded-2xl border transition-all duration-200 focus:outline-none
              ${
                dropdownOpen
                  ? 'border-red-500/40 bg-red-500/10'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'
              }
            `}
            aria-label="User menu"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/30 to-red-600/10 text-sm font-black text-red-300 border border-red-500/25 tracking-wide">
              {user?.name?.[0]?.toUpperCase() || 'A'}
            </div>
          </button>

          {/* DROPDOWN MENU */}
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                className="absolute right-0 mt-3 w-64 origin-top-right rounded-2xl border border-white/10 bg-zinc-950/98 p-2 backdrop-blur-2xl shadow-2xl shadow-black/60 z-50"
              >
                {/* Profile Header */}
                <div className="flex items-center gap-3 px-3 py-3 border-b border-white/[0.06]">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/30 to-red-600/10 text-sm font-black text-red-300 border border-red-500/20">
                    {user?.name?.[0]?.toUpperCase() || 'A'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {user?.name || 'Operator'}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {user?.email || 'admin@runtime.ai'}
                    </p>
                  </div>
                </div>

                {/* Role Badge */}
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-medium">Clearance Level</span>
                  <span className="flex items-center gap-1 text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/15 rounded px-2 py-0.5 uppercase tracking-wider">
                    <ShieldCheck className="h-3 w-3" />
                    {user?.role || 'Admin'}
                  </span>
                </div>

                <div className="h-[1px] bg-white/[0.06] my-1" />

                {/* Menu Items */}
                <div className="space-y-0.5">
                  <button
                    onClick={() => { setDropdownOpen(false); router.push('/settings'); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 transition-all hover:bg-white/[0.04] hover:text-white"
                  >
                    <SettingsIcon className="h-4 w-4 text-zinc-500" />
                    My Configuration
                  </button>

                  <button
                    onClick={() => { setDropdownOpen(false); router.push('/memory'); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 transition-all hover:bg-white/[0.04] hover:text-white"
                  >
                    <Activity className="h-4 w-4 text-zinc-500" />
                    Active Memory Store
                  </button>
                </div>

                <div className="h-[1px] bg-white/[0.06] my-1" />

                {/* Logout */}
                <button
                  onClick={() => { setDropdownOpen(false); logout(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-400 transition-all hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Terminate Session
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}