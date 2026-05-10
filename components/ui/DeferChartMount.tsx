"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type Props = {
  children: ReactNode;
  /** Shown until the slice is intersecting (+ optional stagger delay). */
  fallback: ReactNode;
  /** Extra delay after intersecting — spreads chart chunk loads over time. */
  staggerMs?: number;
  /** Preconnect rows before `rootMargin`; larger = sooner mount below the fold. */
  rootMargin?: string;
};

/**
 * Defers mounting children until near the viewport so heavy chart bundles and
 * SWR spikes do not contend on first paint.
 */
export function DeferChartMount({
  children,
  fallback,
  staggerMs = 0,
  rootMargin = "320px",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const root = wrapRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) setInView(true);
      },
      { root: null, rootMargin, threshold: 0 },
    );

    obs.observe(root);
    return () => obs.disconnect();
  }, [rootMargin]);

  useEffect(() => {
    if (!inView) return;
    const t = window.setTimeout(() => setReady(true), staggerMs);
    return () => window.clearTimeout(t);
  }, [inView, staggerMs]);

  return (
    <div ref={wrapRef} className="h-full min-h-0 w-full">
      {ready ? children : fallback}
    </div>
  );
}
