"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  hue: number;
  sway: number;
};

// Lightweight canvas ember drift - glowing motes rising and guttering out.
// Self-contained: sizes to its parent, respects prefers-reduced-motion, and
// throttles particle count so it never fights the page for CPU.
export function EmberParticles({
  density = 1,
  connect = false,
}: {
  density?: number;
  /** Draw faint constellation-style lines between nearby particles. */
  connect?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const particles: Particle[] = [];
    const maxParticles = Math.round(36 * density);

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn() {
      particles.push({
        x: Math.random() * width,
        y: height + 10,
        vx: 0,
        vy: -(0.25 + Math.random() * 0.5),
        size: 1 + Math.random() * 2,
        life: 0,
        maxLife: 6000 + Math.random() * 6000,
        hue: 18 + Math.random() * 30, // ember orange -> amber
        sway: Math.random() * Math.PI * 2,
      });
    }

    let last = performance.now();
    let raf: number;
    function frame(t: number) {
      const dt = Math.min(64, t - last);
      last = t;

      if (particles.length < maxParticles && Math.random() < 0.06) spawn();

      ctx!.clearRect(0, 0, width, height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        p.sway += dt * 0.001;
        p.x += Math.sin(p.sway) * 0.15;
        p.y += p.vy * (dt / 16);
        const lifeT = p.life / p.maxLife;
        if (lifeT >= 1 || p.y < -10) {
          particles.splice(i, 1);
          continue;
        }
      }

      // Constellation lines between nearby particles, drawn before the
      // embers themselves so the glow reads on top of the linework - O(n^2)
      // but n stays in the dozens, so it's cheap.
      if (connect) {
        const maxDist = 90;
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i];
            const b = particles[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist >= maxDist) continue;
            const lineAlpha = (1 - dist / maxDist) * 0.18;
            ctx!.strokeStyle = `hsla(28, 100%, 60%, ${lineAlpha})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      for (const p of particles) {
        const lifeT = p.life / p.maxLife;
        const fade = lifeT < 0.15 ? lifeT / 0.15 : lifeT > 0.7 ? 1 - (lifeT - 0.7) / 0.3 : 1;
        const alpha = Math.max(0, fade) * 0.55;
        const grad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        grad.addColorStop(0, `hsla(${p.hue}, 100%, 60%, ${alpha})`);
        grad.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        ctx!.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, connect]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    />
  );
}
