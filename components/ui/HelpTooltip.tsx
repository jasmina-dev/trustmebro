"use client";

import { useId, useRef, useState } from "react";

/**
 * Small hover/focus help tooltip used in chart headers.
 *
 * @remarks
 * Opens when the trigger is hovered or focused. Closes when focus leaves the
 * control (blur) or when the pointer leaves the trigger + panel — except if
 * focus remains inside this control, pointer-leave alone does not close, so
 * keyboard users are not cleared out by moving the mouse away.
 */
export function HelpTooltip({
  title = "What this shows",
  content,
}: {
  title?: string;
  content: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();

  return (
    <div
      ref={rootRef}
      className="relative inline-flex flex-col items-end"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => {
        const root = rootRef.current;
        if (root?.contains(document.activeElement)) return;
        setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={open ? tooltipId : undefined}
        aria-label={
          open ? "Chart explanation visible" : "Show chart explanation"
        }
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-elev text-xs font-bold text-fg-muted transition-colors hover:text-fg"
      >
        ?
      </button>
      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute right-0 top-full z-20 w-72 pt-2"
        >
          <div className="rounded-md border border-border bg-bg-card p-3 text-xs shadow-xl">
            <div className="mb-1 font-semibold text-fg">{title}</div>
            <p className="leading-relaxed text-fg-muted">{content}</p>
          </div>
        </div>
      )}
    </div>
  );
}
