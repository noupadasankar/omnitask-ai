'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import {
  Palette,
  Sun,
  Moon,
  Type,
  Maximize2,
  Minimize2,
  Eye,
  Bot,
  Check,
  Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCENTS = [
  { id: 'red', label: 'Red', color: '#ef4444', bg: 'bg-red-500' },
  { id: 'indigo', label: 'Indigo', color: '#6366f1', bg: 'bg-indigo-500' },
  { id: 'green', label: 'Green', color: '#10b981', bg: 'bg-emerald-500' },
  { id: 'purple', label: 'Purple', color: '#a855f7', bg: 'bg-purple-500' },
];

const FONT_SIZES = [
  { id: 'sm', label: 'Small', scale: 'text-sm' },
  { id: 'base', label: 'Medium', scale: 'text-base' },
  { id: 'lg', label: 'Large', scale: 'text-lg' },
];

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();
  const [accent, setAccent] = useState('red');
  const [fontSize, setFontSize] = useState('base');
  const [compact, setCompact] = useState(false);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white">Appearance</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Customize the look and feel of your dashboard.
        </p>
      </div>

      {/* Theme */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <Monitor className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Theme</h2>
        </div>
        <div className="flex gap-3">
          <ThemeCard
            icon={Moon}
            label="Dark"
            active={theme === 'dark'}
            onClick={() => setTheme('dark')}
          />
          <ThemeCard
            icon={Sun}
            label="Light"
            active={theme === 'light'}
            onClick={() => setTheme('light')}
          />
        </div>
      </div>

      {/* Accent Color */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <Palette className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Accent Color</h2>
        </div>
        <div className="flex gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccent(a.id)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all flex-1',
                accent === a.id
                  ? 'border-white/20 bg-white/[0.05]'
                  : 'border-white/[0.07] hover:border-white/15',
              )}
            >
              <div className={cn('flex h-8 w-8 items-center justify-center rounded-full', a.bg)}>
                {accent === a.id && <Check className="h-4 w-4 text-white" />}
              </div>
              <span className={cn('text-[11px] font-medium', accent === a.id ? 'text-white' : 'text-zinc-500')}>
                {a.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <Type className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Font Size</h2>
        </div>
        <div className="flex gap-3">
          {FONT_SIZES.map((fs) => (
            <button
              key={fs.id}
              onClick={() => setFontSize(fs.id)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all flex-1',
                fontSize === fs.id
                  ? 'border-white/20 bg-white/[0.05]'
                  : 'border-white/[0.07] hover:border-white/15',
              )}
            >
              <span className={cn('font-semibold text-white', fs.scale)}>Aa</span>
              <span className={cn('text-[11px] font-medium', fontSize === fs.id ? 'text-white' : 'text-zinc-500')}>
                {fs.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Compact UI */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
              {compact ? <Minimize2 className="h-4 w-4 text-red-400" /> : <Maximize2 className="h-4 w-4 text-red-400" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Compact Mode</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Reduce padding and spacing for a denser layout</p>
            </div>
          </div>
          <button
            onClick={() => setCompact(!compact)}
            className={cn(
              'relative h-7 w-12 rounded-full transition-colors',
              compact ? 'bg-red-500' : 'bg-white/[0.1]',
            )}
          >
            <div className={cn(
              'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
              compact ? 'translate-x-5.5 left-0.5' : 'left-0.5',
            )} />
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <Eye className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Preview</h2>
        </div>
        <div className="space-y-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${ACCENTS.find((a) => a.id === accent)?.color}20` }}>
              <Bot className="h-5 w-5" style={{ color: ACCENTS.find((a) => a.id === accent)?.color }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Sample Agent Card</p>
              <p className="text-xs text-zinc-500">This is how components will appear</p>
            </div>
            <span className="ml-auto rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
              ACTIVE
            </span>
          </div>
          <div className="flex gap-2">
            <button className="rounded-xl px-4 py-2 text-xs font-semibold text-white transition-all" style={{ backgroundColor: ACCENTS.find((a) => a.id === accent)?.color }}>
              Primary Action
            </button>
            <button className="rounded-xl border border-white/[0.07] px-4 py-2 text-xs font-semibold text-zinc-400 transition-all hover:bg-white/[0.05]">
              Secondary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-center gap-3 rounded-xl border p-6 transition-all',
        active ? 'border-white/20 bg-white/[0.05]' : 'border-white/[0.07] hover:border-white/15',
      )}
    >
      <Icon className={cn('h-6 w-6', active ? 'text-red-400' : 'text-zinc-500')} />
      <span className={cn('text-sm font-medium', active ? 'text-white' : 'text-zinc-500')}>{label}</span>
      {active && <span className="text-[10px] font-semibold text-red-400">Active</span>}
    </button>
  );
}
