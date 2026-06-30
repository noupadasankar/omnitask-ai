'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Briefcase, ShoppingBag, FileSearch, Link2, Megaphone, UtensilsCrossed, Inbox, ExternalLink, Star } from 'lucide-react';
import type { AgentResult } from '@/store/agent.store';

const KIND_META: Record<string, { label: string; icon: React.ReactNode; accent: string }> = {
  jobs: { label: 'Jobs', icon: <Briefcase className="h-3.5 w-3.5" />, accent: 'text-sky-400' },
  products: { label: 'Products', icon: <ShoppingBag className="h-3.5 w-3.5" />, accent: 'text-emerald-400' },
  food: { label: 'Food', icon: <UtensilsCrossed className="h-3.5 w-3.5" />, accent: 'text-orange-400' },
  research: { label: 'Research', icon: <FileSearch className="h-3.5 w-3.5" />, accent: 'text-purple-400' },
  links: { label: 'Results', icon: <Link2 className="h-3.5 w-3.5" />, accent: 'text-blue-400' },
  social_drafts: { label: 'Drafts', icon: <Megaphone className="h-3.5 w-3.5" />, accent: 'text-pink-400' },
};

function metaFor(kind: string) {
  return KIND_META[kind] || { label: kind, icon: <Inbox className="h-3.5 w-3.5" />, accent: 'text-zinc-400' };
}

function priceText(item: Record<string, any>): string | null {
  if (item.priceText) return String(item.priceText);
  if (typeof item.price === 'number') return `₹${item.price.toLocaleString('en-IN')}`;
  return null;
}

function ResultCard({ kind, item }: { kind: string; item: Record<string, any> }) {
  const title = item.title || item.text || item.url || 'Untitled';
  const url = item.url as string | undefined;
  const subtitleParts = [item.company, item.brand, item.location, item.platform].filter(Boolean);
  const price = priceText(item);
  const rating = typeof item.rating === 'number' ? item.rating : null;
  const summary = item.summary || item.snippet || (kind === 'social_drafts' ? item.text : null);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-all">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold text-zinc-200 leading-snug line-clamp-2">{title}</p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-zinc-500 hover:text-white transition-colors"
            title="Open"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {subtitleParts.length > 0 && (
        <p className="mt-1 text-[10px] text-zinc-500 truncate">{subtitleParts.join(' · ')}</p>
      )}

      {(price || rating !== null) && (
        <div className="mt-2 flex items-center gap-3">
          {price && <span className="text-[12px] font-bold text-emerald-400">{price}</span>}
          {rating !== null && (
            <span className="flex items-center gap-1 text-[10px] text-yellow-400">
              <Star className="h-3 w-3 fill-current" /> {rating.toFixed(1)}
            </span>
          )}
        </div>
      )}

      {summary && (
        <p className="mt-2 text-[10px] text-zinc-400 leading-relaxed line-clamp-3">{summary}</p>
      )}

      {Array.isArray(item.hashtags) && item.hashtags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.hashtags.slice(0, 4).map((h: string, i: number) => (
            <span key={i} className="text-[9px] text-pink-400/80">#{String(h).replace(/^#/, '')}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResultsPanel({ results }: { results: AgentResult[] }) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-zinc-600">
        <Inbox className="h-5 w-5 mb-2 opacity-50" />
        <span className="text-xs">No results yet — the agent will surface findings here.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {results.map((result) => {
        const meta = metaFor(result.kind);
        return (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2 px-1">
              <span className={meta.accent}>{meta.icon}</span>
              <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">{meta.label}</span>
              <span className="text-[10px] text-zinc-600 font-mono">{result.count}</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {result.items.slice(0, 12).map((item, i) => (
                <ResultCard key={i} kind={result.kind} item={item} />
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
