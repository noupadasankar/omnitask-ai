'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen w-screen flex-col items-center justify-center bg-black text-white p-6 font-mono">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, #ef4444 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        
        <div className="relative z-10 flex flex-col items-center max-w-xl w-full text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 mb-6 animate-pulse">
            <span className="text-2xl">🛑</span>
          </div>

          <h2 className="text-lg font-black tracking-widest text-red-500 uppercase mb-2">
            CRITICAL APPLICATION EXCEPTION
          </h2>
          <p className="text-xs text-zinc-500 mb-6 uppercase tracking-wider">
            Root Layout Container Intercepted Crash
          </p>

          <div className="w-full bg-zinc-950/80 border border-white/5 p-4 rounded-xl text-left text-xs text-zinc-400 overflow-auto max-h-[300px] mb-6 backdrop-blur-md">
            <p className="font-bold text-red-400 mb-1">Diagnostic Message:</p>
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-300">{error.message || String(error)}</pre>
            
            {error.stack && (
              <>
                <p className="font-bold text-red-400 mt-4 mb-1">Stack Telemetry:</p>
                <pre className="whitespace-pre-wrap text-[9px] font-mono text-zinc-500">{error.stack}</pre>
              </>
            )}
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => reset()}
              className="h-10 px-6 rounded-xl bg-red-500 text-xs font-bold text-white transition-all hover:bg-red-400 active:scale-95"
            >
              Reset Session Container
            </button>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.clear();
                  window.location.href = '/login';
                }
              }}
              className="h-10 px-6 rounded-xl border border-white/10 bg-white/[0.02] text-xs font-bold text-zinc-400 hover:text-white transition-all hover:bg-white/[0.04] active:scale-95"
            >
              Clear Storage & Force Login
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
