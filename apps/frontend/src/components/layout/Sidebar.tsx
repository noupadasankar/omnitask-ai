'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Cpu } from 'lucide-react';
import { navigation } from '@/config/navigation';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        `
          hidden
          lg:flex
          h-screen
          flex-col
          border-r
          border-white/10
          bg-black/40
          backdrop-blur-2xl
          transition-all
          duration-300
          ease-in-out
          flex-shrink-0
          z-30
        `,
        isHovered ? 'w-[280px]' : 'w-[88px]'
      )}
    >
      {/* ================================================= */}
      {/* LOGO */}
      {/* ================================================= */}
      <div className="border-b border-white/10 p-5 h-20 flex items-center">
        <div className="flex items-center gap-4 w-full">
          <div
            className="
              flex
              h-12
              w-12
              flex-shrink-0
              items-center
              justify-center
              rounded-xl
              border
              border-red-500/20
              bg-red-500/10
              mx-auto
            "
          >
            <Cpu className="h-6 w-6 text-red-400" />
          </div>

          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col min-w-0"
              >
                <h1 className="text-sm font-black tracking-wider uppercase text-white truncate leading-none">
                  OmniTask AI
                </h1>
                <p className="text-[10px] text-zinc-500 mt-1 font-mono tracking-widest leading-none truncate">
                  RUNTIME OS
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ================================================= */}
      {/* NAVIGATION */}
      {/* ================================================= */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {navigation.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.title} href={item.href}>
              <motion.div
                whileHover={{ x: isHovered ? 4 : 0 }}
                className={cn(
                  `
                    group
                    relative
                    flex
                    items-center
                    overflow-hidden
                    rounded-2xl
                    border
                    transition-all
                    duration-200
                    h-14
                  `,
                  isHovered ? 'px-4 justify-between' : 'px-0 justify-center',
                  active
                    ? 'border-red-500/20 bg-red-500/10'
                    : 'border-transparent hover:border-white/10 hover:bg-white/[0.03]'
                )}
              >
                {/* ACTIVE GLOW BAR */}
                {active && (
                  <div className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-red-500" />
                )}

                <div className="flex items-center gap-4">
                  {/* ICON CONTAINER */}
                  <div
                    className={cn(
                      `
                        flex
                        h-11
                        w-11
                        flex-shrink-0
                        items-center
                        justify-center
                        rounded-xl
                        transition-all
                      `,
                      active
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-black/30 text-zinc-500 group-hover:text-white'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* LABEL TEXTS */}
                  <AnimatePresence>
                    {isHovered && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="flex flex-col min-w-0"
                      >
                        <p className={cn('text-xs font-semibold', active ? 'text-white' : 'text-zinc-400')}>
                          {item.title}
                        </p>
                        <p className="text-[10px] text-zinc-600 truncate max-w-[170px] mt-0.5">
                          {item.description || 'Runtime Module'}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* CHEVRON */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 transition-all',
                          active
                            ? 'text-red-400 opacity-100'
                            : 'text-zinc-700 opacity-0 group-hover:opacity-100'
                        )}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}