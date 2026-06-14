'use client';

import { useEffect, useMemo, useState } from 'react';


export default function Loading() {
  const [progress, setProgress] = useState(0);

  const progressText = useMemo(() => Math.round(progress), [progress]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((prev) => {
        // Keep it feeling responsive, but don’t ever complete immediately.
        if (prev >= 90) return prev;
        const increment = 5 + Math.random() * 12; // 5..17
        return Math.min(90, prev + increment);
      });
    }, 180);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div
      className="relative flex h-[calc(100vh-4.5rem)] w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted/30"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {/* Animated Background Orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl animate-pulse-gentle" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-secondary/10 blur-3xl animate-pulse-gentle delay-700" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Advanced Spinner */}
        <div className="mb-8 flex items-center justify-center">
          <div className="relative h-16 w-16">
            {/* Outer rotating ring */}
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/50 animate-spin-slow" />

            {/* Middle pulsing ring */}
            <div className="absolute inset-2 rounded-full border-2 border-primary/30 animate-pulse-gentle" />

            {/* Inner core */}
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 animate-pulse-gentle" />

            {/* Center dot */}
            <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary animate-pulse-gentle" />
          </div>
        </div>

        {/* Loading Text */}
        <div className="mb-6 flex h-6 items-center justify-center">
          <p className="text-base font-medium text-foreground">
            Loading
            <span className="inline-block w-1 animate-pulse-gentle">.</span>
            <span className="inline-block w-1 animate-pulse-gentle delay-100">.</span>
            <span className="inline-block w-1 animate-pulse-gentle delay-200">.</span>
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-48 overflow-hidden rounded-full bg-muted/50 backdrop-blur-sm">
          <div
            className="h-1 rounded-full bg-gradient-to-r from-primary via-primary/70 to-primary/40 shadow-lg shadow-primary/50 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Progress Text */}
        <p className="mt-3 text-xs font-medium text-muted-foreground">{progressText}%</p>

        {/* Helpful Message */}
        <p className="mt-8 text-xs text-muted-foreground/70">Initializing resources...</p>
      </div>
    </div>
  );
}

