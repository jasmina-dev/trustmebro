"use client";

import { useEffect, useRef, useState } from "react";

export function HelpTooltip({
  title = "What this shows",
  content,
}: {
  title?: string;
  content: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Hide chart explanation" : "Show chart explanation"}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-elev text-xs font-bold text-fg-muted transition-colors hover:text-fg"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-72 rounded-md border border-border bg-bg-card p-3 text-xs shadow-xl">
          <div className="mb-1 font-semibold text-fg">{title}</div>
          <p className="leading-relaxed text-fg-muted">{content}</p>
        </div>
      )}
    </div>
  );
}
