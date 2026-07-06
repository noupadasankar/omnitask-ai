<<<<<<< HEAD
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, UserCircle2, KeyRound, Palette, Lock, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

const SETTINGS_NAV = [
  { title: 'Overview', href: '/settings', icon: Settings },
  { title: 'Profile', href: '/settings/profile', icon: UserCircle2 },
  { title: 'API Keys', href: '/settings/api-keys', icon: KeyRound },
  { title: 'Appearance', href: '/settings/appearance', icon: Palette },
  { title: 'Vault', href: '/settings/vault', icon: Lock },
  { title: 'Voice', href: '/settings/voice', icon: Mic },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.02] p-1.5">
        {SETTINGS_NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                active
                  ? 'border border-red-500/20 bg-red-500/10 text-red-400'
                  : 'border border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.title}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
=======
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
}
