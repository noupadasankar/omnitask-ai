'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Command,
  Search,
  User,
  LogOut,
  Settings as SettingsIcon,
  ChevronDown,
  Activity,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { MobileNav } from './MobileNav';

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
    <header
      className="
        sticky
        top-0
        z-40
        flex
        h-20
        items-center
        justify-between
        border-b
        border-white/10
        bg-black/40
        px-6
        backdrop-blur-2xl
      "
    >
      {/* LEFT */}
      <div className="flex items-center gap-4">
        <MobileNav />
        <div
          className="
            hidden
            md:flex
            items-center
            gap-3
            rounded-2xl
            border
            border-white/10
            bg-white/[0.03]
            px-4
            py-3
          "
        >
          <Search className="h-4 w-4 text-zinc-500" />

          <input
            placeholder="Search runtime..."
            className="
              bg-transparent
              text-sm
              text-white
              outline-none
              placeholder:text-zinc-600
            "
          />

          <div
            className="
              flex
              items-center
              gap-1
              rounded-md
              border
              border-white/10
              bg-black/30
              px-2
              py-1
              text-[10px]
              text-zinc-500
            "
          >
            <Command className="h-3 w-3" />
            K
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-4">
        {/* NOTIFICATIONS */}
        <button
          className="
            relative
            flex
            h-12
            w-12
            items-center
            justify-center
            rounded-2xl
            border
            border-white/10
            bg-white/[0.03]
            text-zinc-400
            transition-all
            hover:text-white
          "
        >
          <Bell className="h-5 w-5" />

          <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* PROFILE DROPDOWN WRAPPER */}
        <div className="relative" ref={dropdownRef}>
          {/* TRIGGER */}
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="
              flex
              items-center
              gap-3
              rounded-2xl
              border
              border-white/10
              bg-white/[0.03]
              pl-2
              pr-4
              py-2
              transition-all
              hover:bg-white/[0.06]
              hover:border-white/20
              focus:outline-none
            "
          >
            {/* INITIALS */}
            <div
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-xl
                bg-red-500/10
                text-sm
                font-bold
                text-red-300
                border
                border-red-500/25
              "
            >
              {user?.name?.[0] || 'A'}
            </div>

            <span className="hidden md:block text-xs font-semibold text-zinc-300">
              {user?.name || 'Operator'}
            </span>

            <ChevronDown
              className={`
                h-3.5
                w-3.5
                text-zinc-500
                transition-transform
                duration-200
                ${dropdownOpen ? 'rotate-180 text-white' : ''}
              `}
            />
          </button>

          {/* DROPDOWN MENU */}
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="
                  absolute
                  right-0
                  mt-3
                  w-64
                  origin-top-right
                  rounded-2xl
                  border
                  border-white/10
                  bg-zinc-950/95
                  p-2
                  backdrop-blur-xl
                  shadow-2xl
                  z-50
                "
              >
                {/* Header Profile Summary */}
                <div className="flex items-center gap-3 px-3 py-3 border-b border-white/[0.06]">
                  <div
                    className="
                      flex
                      h-11
                      w-11
                      items-center
                      justify-center
                      rounded-xl
                      bg-red-500/10
                      text-sm
                      font-bold
                      text-red-300
                      border
                      border-red-500/20
                    "
                  >
                    {user?.name?.[0] || 'A'}
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
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-medium">Role</span>
                  <span className="flex items-center gap-1 text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/15 rounded px-2 py-0.5 uppercase tracking-wider">
                    <ShieldCheck className="h-3 w-3" />
                    Admin
                  </span>
                </div>

                <div className="h-[1px] bg-white/[0.06] my-1" />

                {/* Navigation Items */}
                <div className="space-y-0.5">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      router.push('/settings');
                    }}
                    className="
                      w-full
                      flex
                      items-center
                      gap-3
                      px-3
                      py-2
                      rounded-xl
                      text-xs
                      font-medium
                      text-zinc-400
                      transition-all
                      hover:bg-white/[0.04]
                      hover:text-white
                    "
                  >
                    <SettingsIcon className="h-4 w-4 text-zinc-500" />
                    My Configuration
                  </button>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      router.push('/memory');
                    }}
                    className="
                      w-full
                      flex
                      items-center
                      gap-3
                      px-3
                      py-2
                      rounded-xl
                      text-xs
                      font-medium
                      text-zinc-400
                      transition-all
                      hover:bg-white/[0.04]
                      hover:text-white
                    "
                  >
                    <Activity className="h-4 w-4 text-zinc-500" />
                    Active Memory Store
                  </button>
                </div>

                <div className="h-[1px] bg-white/[0.06] my-1" />

                {/* Logout Button */}
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                  className="
                    w-full
                    flex
                    items-center
                    gap-3
                    px-3
                    py-2.5
                    rounded-xl
                    text-xs
                    font-semibold
                    text-red-400
                    transition-all
                    hover:bg-red-500/10
                  "
                >
                  <LogOut className="h-4 w-4" />
                  Terminated Session (Logout)
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}