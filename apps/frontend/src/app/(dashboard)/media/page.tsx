'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Play, Music, Clock, History } from 'lucide-react';
import { searchMedia, playMedia, getMediaHistory } from '@/services/media.service';

export default function MediaPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    try {
      const res = await searchMedia(query);
      setResults(res);
      setShowHistory(false);
    } catch { /* empty */ }
  };

  const handlePlay = async (trackId: string, provider?: string) => {
    try {
      const res = await playMedia(undefined, trackId, provider);
      if (res.url) {
        window.open(res.url, '_blank');
      }
      setPlaying(trackId);
    } catch { /* empty */ }
  };

  const loadHistory = async () => {
    try {
      const h = await getMediaHistory(20);
      setHistory(h);
      setShowHistory(true);
    } catch { /* empty */ }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Media</h1>
          <p className="text-sm text-zinc-400 mt-1">Search and play music, videos, and podcasts</p>
        </div>
        <button
          onClick={loadHistory}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold text-zinc-400 hover:bg-white/[0.04] transition-all"
        >
          <History className="h-3.5 w-3.5" />
          HISTORY
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for songs, artists, albums, or videos..."
            className="w-full p-4 pl-12 rounded-2xl bg-black/60 border border-white/10 text-sm text-white placeholder-zinc-500"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        </div>
        <button
          onClick={handleSearch}
          className="px-6 py-4 rounded-2xl bg-red-500/20 border border-red-500/30 text-xs font-bold text-red-400 hover:bg-red-500/30 transition-all"
        >
          SEARCH
        </button>
      </div>

      {showHistory && history.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-zinc-400" />
            <span className="text-xs font-bold text-zinc-300 uppercase">Recent Plays</span>
          </div>
          {history.map((entry, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div>
                <p className="text-xs text-zinc-300">{entry.action} - {entry.query || entry.trackId}</p>
                <p className="text-[10px] text-zinc-600">{entry.provider} · {new Date(entry.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((track, i) => (
          <motion.div
            key={track.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur-2xl p-5 group hover:border-white/10 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-white">{track.title}</h3>
                <p className="text-xs text-zinc-400 mt-0.5">{track.artist}</p>
                {track.album && (
                  <p className="text-[10px] text-zinc-500">{track.album}</p>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-lg">
                <Music className="h-5 w-5 text-red-400" />
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-zinc-600 mb-3">
              <span className="uppercase">{track.provider}</span>
              <span>·</span>
              <span>{Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}</span>
            </div>

            <button
              onClick={() => handlePlay(track.id, track.provider)}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs font-semibold text-zinc-300 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all group"
            >
              <Play className="h-3.5 w-3.5" />
              {playing === track.id ? 'PLAYING...' : 'PLAY'}
            </button>
          </motion.div>
        ))}

        {results.length === 0 && query && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 rounded-2xl border border-dashed border-white/5">
            <Music className="h-8 w-8 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-500">No results found</p>
          </div>
        )}
      </div>
    </div>
  );
}
