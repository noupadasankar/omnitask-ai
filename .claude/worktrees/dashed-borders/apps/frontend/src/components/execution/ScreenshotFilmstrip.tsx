'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, ChevronLeft, ChevronRight, Maximize2, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScreenshotFrame } from '@/types/agent';

interface ScreenshotFilmstripProps {
  screenshotHistory: ScreenshotFrame[];
  currentScreenshot: ScreenshotFrame | null;
}

export function ScreenshotFilmstrip({ screenshotHistory, currentScreenshot }: ScreenshotFilmstripProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Auto-scroll to latest
  useEffect(() => {
    if (trackRef.current && screenshotHistory.length > 0) {
      trackRef.current.scrollLeft = trackRef.current.scrollWidth;
    }
  }, [screenshotHistory.length]);

  // Modal keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setSelectedIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight') {
        setSelectedIndex(prev => (prev !== null && prev < screenshotHistory.length - 1 ? prev + 1 : prev));
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedIndex, screenshotHistory.length]);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const isCurrentFrame = (frame: ScreenshotFrame) => {
    return currentScreenshot?.timestamp === frame.timestamp && currentScreenshot?.stepIndex === frame.stepIndex;
  };

  // Generate sprocket holes based on number of thumbnails
  const sprocketCount = Math.max(12, Math.ceil(screenshotHistory.length * 1.5));

  if (screenshotHistory.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/40 backdrop-blur-2xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Film className="h-3.5 w-3.5 text-zinc-600" />
            <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest">FRAME BUFFER</span>
          </div>
          <span className="text-[9px] font-mono text-zinc-600">0/50 FRAMES</span>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Camera className="h-6 w-6 text-zinc-700 mb-2" />
          <span className="text-[10px] font-mono text-zinc-600">No frames captured yet</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-zinc-950/40 backdrop-blur-2xl p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Film className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest">FRAME BUFFER</span>
          </div>
          <span className="text-[9px] font-mono text-zinc-500">
            <span className="text-red-400 font-bold">{screenshotHistory.length}</span>/50 FRAMES
          </span>
        </div>

        {/* Sprocket holes */}
        <div className="filmstrip-sprocket">
          {Array.from({ length: sprocketCount }).map((_, i) => (
            <div key={i} className="filmstrip-sprocket-hole" />
          ))}
        </div>

        {/* Filmstrip track */}
        <div ref={trackRef} className="filmstrip-track cyber-scroll-h">
          {screenshotHistory.map((frame, idx) => {
            const isCurrent = isCurrentFrame(frame);

            return (
              <motion.div
                key={`${frame.timestamp}-${frame.stepIndex}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.02 }}
                className={cn("filmstrip-thumb group", isCurrent && "active")}
                onClick={() => setSelectedIndex(idx)}
              >
                {/* Thumbnail image */}
                <img
                  src={`data:image/jpeg;base64,${frame.base64}`}
                  alt={`Frame ${idx + 1}`}
                  loading="lazy"
                />

                {/* Step badge */}
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[7px] font-mono font-bold text-white border border-white/10">
                  S{frame.stepIndex + 1}
                </div>

                {/* Timestamp */}
                <div className="absolute bottom-0.5 right-1 text-[6px] font-mono text-white/60 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatTime(frame.timestamp)}
                </div>

                {/* Current frame indicator */}
                {isCurrent && (
                  <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                )}

                {/* Hover expand icon */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all">
                  <Maximize2 className="h-4 w-4 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom sprocket holes */}
        <div className="filmstrip-sprocket mt-1">
          {Array.from({ length: sprocketCount }).map((_, i) => (
            <div key={i} className="filmstrip-sprocket-hole" />
          ))}
        </div>
      </div>

      {/* Fullscreen Preview Modal */}
      <AnimatePresence>
        {selectedIndex !== null && screenshotHistory[selectedIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-xl"
            onClick={() => setSelectedIndex(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-[90vw] max-h-[85vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedIndex(null)}
                className="absolute -top-4 -right-4 z-10 h-8 w-8 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Navigation arrows */}
              {selectedIndex > 0 && (
                <button
                  onClick={() => setSelectedIndex(selectedIndex - 1)}
                  className="absolute left-[-50px] top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-zinc-900/80 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {selectedIndex < screenshotHistory.length - 1 && (
                <button
                  onClick={() => setSelectedIndex(selectedIndex + 1)}
                  className="absolute right-[-50px] top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-zinc-900/80 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}

              {/* Screenshot */}
              <img
                src={`data:image/jpeg;base64,${screenshotHistory[selectedIndex].base64}`}
                alt={`Screenshot ${selectedIndex + 1}`}
                className="max-w-full max-h-[75vh] rounded-xl border border-white/10 shadow-2xl object-contain"
              />

              {/* Info bar */}
              <div className="mt-3 flex items-center gap-4 px-4 py-2 rounded-xl bg-zinc-900/80 border border-white/10 text-[10px] font-mono text-zinc-400">
                <span>Frame <span className="text-white font-bold">{selectedIndex + 1}</span>/{screenshotHistory.length}</span>
                <span className="text-zinc-700">|</span>
                <span>Step <span className="text-red-400 font-bold">{screenshotHistory[selectedIndex].stepIndex + 1}</span></span>
                <span className="text-zinc-700">|</span>
                <span>{screenshotHistory[selectedIndex].width}×{screenshotHistory[selectedIndex].height}</span>
                <span className="text-zinc-700">|</span>
                <span>{formatTime(screenshotHistory[selectedIndex].timestamp)}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
