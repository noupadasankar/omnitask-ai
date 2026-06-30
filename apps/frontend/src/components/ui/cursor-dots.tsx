"use client";
import { useEffect, useRef } from "react";

export function CursorDots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let mouse = { x: -999, y: -999 };

    const DOT_SPACING = 28;
    const DOT_RADIUS = 1.2;
    const DOT_COLOR = "rgba(239, 68, 68,";
    const REPEL_RADIUS = 120;
    const REPEL_STRENGTH = 60;

    interface Dot {
      ox: number;
      oy: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
    }

    let dots: Dot[] = [];

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      buildDots();
    }

    function buildDots() {
      dots = [];
      const cols = Math.ceil(canvas!.width / DOT_SPACING);
      const rows = Math.ceil(canvas!.height / DOT_SPACING);
      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          dots.push({
            ox: i * DOT_SPACING,
            oy: j * DOT_SPACING,
            x: i * DOT_SPACING,
            y: j * DOT_SPACING,
            vx: 0,
            vy: 0,
          });
        }
      }
    }

    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      for (const dot of dots) {
        const dx = dot.ox - mouse.x;
        const dy = dot.oy - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < REPEL_RADIUS) {
          const force = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH;
          const angle = Math.atan2(dy, dx);
          dot.vx += Math.cos(angle) * force * 0.15;
          dot.vy += Math.sin(angle) * force * 0.15;
        }

        dot.vx += (dot.ox - dot.x) * 0.08;
        dot.vy += (dot.oy - dot.y) * 0.08;
        dot.vx *= 0.75;
        dot.vy *= 0.75;
        dot.x += dot.vx;
        dot.y += dot.vy;

        const ddx = dot.x - mouse.x;
        const ddy = dot.y - mouse.y;
        const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
        const alpha =
          ddist < REPEL_RADIUS
            ? 0.15 + (1 - ddist / REPEL_RADIUS) * 0.85
            : 0.25;

        ctx!.beginPath();
        ctx!.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx!.fillStyle = DOT_COLOR + alpha + ")";
        ctx!.fill();
      }

      animationId = requestAnimationFrame(animate);
    }

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onMouseLeave = () => {
      mouse.x = -999;
      mouse.y = -999;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("resize", resize);

    resize();
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
