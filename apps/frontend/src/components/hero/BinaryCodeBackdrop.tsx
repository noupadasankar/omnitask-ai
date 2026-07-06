'use client';

/* =====================================================================
   BinaryCodeBackdrop — drifting "0 1" binary-code background
   ---------------------------------------------------------------------
   Lightweight 2D-canvas matrix rain of 0/1 glyphs in the amber/ember
   theme, meant to sit BEHIND the neural brain as deep-space ambience.
   Self-contained, SSR-safe (canvas only touched in useEffect),
   DPR-clamped, reduced-motion aware, fully cleaned up on unmount.
   ===================================================================== */

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

interface BinaryCodeBackdropProps {
  className?: string;
}

export default function BinaryCodeBackdrop({ className }: BinaryCodeBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext('2d');
    if (!context) return;
    // typed non-null aliases so narrowing survives inside the closures below
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const FONT_SIZE = 15;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let cols = 0;
    let drops: number[] = [];      // y (in rows) of the leading glyph per column
    let speeds: number[] = [];     // per-column fall speed (rows/frame)
    let active: boolean[] = [];    // only some columns rain, keeps it sparse

    function resize() {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${FONT_SIZE}px "JetBrains Mono", "Courier New", monospace`;
      ctx.textBaseline = 'top';

      cols = Math.ceil(w / FONT_SIZE);
      drops = new Array(cols);
      speeds = new Array(cols);
      active = new Array(cols);
      const rows = h / FONT_SIZE;
      for (let i = 0; i < cols; i++) {
        // seed across (and a bit above) the screen so glyphs show immediately
        drops[i] = Math.floor(Math.random() * rows * 1.4 - rows * 0.4);
        speeds[i] = 0.25 + Math.random() * 0.5;                  // slow drift
        active[i] = Math.random() < 0.6;                         // ~60% of columns rain
      }
    }
    resize();

    let frameId = 0;

    function draw() {
      // self-scheduling loop; skip painting only while the tab is hidden —
      // this backdrop is meant to run continuously (fixed behind the whole page)
      frameId = requestAnimationFrame(draw);
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // translucent fade → leaves fading trails behind each glyph
      ctx.fillStyle = 'rgba(4, 1, 2, 0.18)';
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < cols; i++) {
        if (!active[i]) continue;
        const x = i * FONT_SIZE;
        const y = drops[i] * FONT_SIZE;

        if (y > 0 && y < h) {
          // bright amber head glyph
          ctx.fillStyle = 'rgba(255, 210, 140, 0.95)';
          ctx.fillText(Math.random() < 0.5 ? '0' : '1', x, y);
          // dimmer ember trail glyph just above
          if (y - FONT_SIZE > 0) {
            ctx.fillStyle = 'rgba(255, 140, 74, 0.45)';
            ctx.fillText(Math.random() < 0.5 ? '0' : '1', x, y - FONT_SIZE);
          }
        }

        drops[i] += speeds[i];
        // recycle the column once it falls past the bottom
        if (y > h && Math.random() > 0.975) {
          drops[i] = Math.floor((Math.random() * -20) - 4);
          speeds[i] = 0.25 + Math.random() * 0.5;
          active[i] = Math.random() < 0.7;
        }
      }
    }

    if (reduceMotion) {
      // static single pass — scatter a faint field of 0/1, no animation
      ctx.fillStyle = 'rgba(4, 1, 2, 1)';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      for (let i = 0; i < cols; i++) {
        if (!active[i]) continue;
        const rows = Math.ceil(canvas.clientHeight / FONT_SIZE);
        for (let r = 0; r < rows; r += 2) {
          if (Math.random() < 0.15) {
            ctx.fillStyle = 'rgba(255, 160, 90, 0.18)';
            ctx.fillText(Math.random() < 0.5 ? '0' : '1', i * FONT_SIZE, r * FONT_SIZE);
          }
        }
      }
    } else {
      draw();
    }

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(canvas);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 h-full w-full', className)}
    />
  );
}
