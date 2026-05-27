'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { motion } from 'framer-motion';

import {
  ChevronRight,
  Cpu,
} from 'lucide-react';

import { navigation } from '@/config/navigation';

import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="
        hidden
        lg:flex
        h-screen
        w-[290px]
        flex-col
        border-r
        border-white/10
        bg-black/40
        backdrop-blur-2xl
      "
    >
      {/* ================================================= */}
      {/* LOGO */}
      {/* ================================================= */}

      <div className="border-b border-white/10 p-6">
        <div className="flex items-center gap-4">
          <div
            className="
              flex
              h-14
              w-14
              items-center
              justify-center
              rounded-2xl
              border
              border-red-500/20
              bg-red-500/10
            "
          >
            <Cpu className="h-7 w-7 text-red-400" />
          </div>

          <div>
            <h1 className="text-xl font-black tracking-tight text-white">
              OmniTask AI
            </h1>

            <p className="text-xs text-zinc-500">
              Autonomous Runtime OS
            </p>
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* NAVIGATION */}
      {/* ================================================= */}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {navigation.map((item) => {
            const active =
              pathname === item.href;

            const Icon = item.icon;

            return (
              <Link
                key={item.title}
                href={item.href}
              >
                <motion.div
                  whileHover={{
                    x: 4,
                  }}
                  className={cn(
                    `
                      group
                      relative
                      flex
                      items-center
                      justify-between
                      overflow-hidden
                      rounded-2xl
                      border
                      px-4
                      py-3
                      transition-all
                    `,
                    active
                      ? `
                        border-red-500/20
                        bg-red-500/10
                      `
                      : `
                        border-transparent
                        hover:border-white/10
                        hover:bg-white/[0.03]
                      `,
                  )}
                >
                  {/* GLOW */}
                  {active && (
                    <div className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-red-500" />
                  )}

                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        `
                          flex
                          h-11
                          w-11
                          items-center
                          justify-center
                          rounded-xl
                          transition-all
                        `,
                        active
                          ? `
                            bg-red-500/10
                            text-red-400
                          `
                          : `
                            bg-black/30
                            text-zinc-500
                            group-hover:text-white
                          `,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div>
                      <p
                        className={cn(
                          `
                            text-sm
                            font-medium
                          `,
                          active
                            ? 'text-white'
                            : 'text-zinc-400',
                        )}
                      >
                        {item.title}
                      </p>

                      <p className="text-xs text-zinc-600">
                        Runtime Module
                      </p>
                    </div>
                  </div>

                  <ChevronRight
                    className={cn(
                      `
                        h-4
                        w-4
                        transition-all
                      `,
                      active
                        ? `
                          text-red-400
                          opacity-100
                        `
                        : `
                          text-zinc-700
                          opacity-0
                          group-hover:opacity-100
                        `,
                    )}
                  />
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ================================================= */}
      {/* FOOTER */}
      {/* ================================================= */}

      <div className="border-t border-white/10 p-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-400" />

            <p className="text-sm font-medium text-white">
              Runtime Active
            </p>
          </div>

          <p className="text-xs leading-relaxed text-zinc-500">
            Autonomous orchestration engine operating
            normally across all agent clusters.
          </p>
        </div>
      </div>
    </aside>
  );
}