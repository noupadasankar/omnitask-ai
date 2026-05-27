'use client';

import { Bell, Command, Search } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';

export function Topbar() {
  const { user, logout } = useAuth();

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

        {/* PROFILE */}
        <div
          className="
            flex
            items-center
            gap-4
            rounded-2xl
            border
            border-white/10
            bg-white/[0.03]
            px-4
            py-2
          "
        >
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
            "
          >
            {user?.name?.[0] || 'A'}
          </div>

          <div className="hidden md:block">
            <p className="text-sm font-medium text-white">
              {user?.name || 'Operator'}
            </p>

            <p className="text-xs text-zinc-500">
              Runtime Administrator
            </p>
          </div>

          <button
            onClick={logout}
            className="
              rounded-xl
              border
              border-white/10
              bg-black/30
              px-3
              py-2
              text-xs
              text-zinc-400
              transition-all
              hover:border-red-500/20
              hover:text-red-300
            "
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}