import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import "./TermHelpIcon.css";

export interface TermHelpIconProps {
  /** Shown in aria-label: "What is …?" */
  termLabel: string;
  dialogTitle: string;
  children: ReactNode;
  className?: string;
}

const GAP = 6;
const VIEWPORT_PAD = 8;
const PANEL_MAX_W = 340;

type PopoverBox = {
  placement: "below" | "above";
  left: number;
  maxWidth: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

function computePopoverBox(trigger: DOMRectReadOnly): PopoverBox {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.min(PANEL_MAX_W, vw - VIEWPORT_PAD * 2);
  const left = Math.max(
    VIEWPORT_PAD,
    Math.min(trigger.left, vw - VIEWPORT_PAD - maxW),
  );
  const spaceBelow = vh - trigger.bottom - GAP - VIEWPORT_PAD;
  const spaceAbove = trigger.top - GAP - VIEWPORT_PAD;
  const capH = Math.min(vh * 0.68, 420);
  const maxHBelow = Math.max(100, Math.min(capH, spaceBelow));
  const maxHAbove = Math.max(100, Math.min(capH, spaceAbove));

  if (spaceBelow >= 140 || spaceBelow >= spaceAbove) {
    return {
      placement: "below",
      left,
      maxWidth: maxW,
      maxHeight: maxHBelow,
      top: trigger.bottom + GAP,
    };
  }
  return {
    placement: "above",
    left,
    maxWidth: maxW,
    maxHeight: maxHAbove,
    bottom: vh - trigger.top + GAP,
  };
}

export function TermHelpIcon({
  termLabel,
  dialogTitle,
  children,
  className = "",
}: TermHelpIconProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const panelId = useId();
  const [box, setBox] = useState<PopoverBox | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const updatePosition = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    setBox(computePopoverBox(wrap.getBoundingClientRect()));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    updatePosition();
  }, [open, children, dialogTitle, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updatePosition();
    window.addEventListener("resize", onResize);
    const onScroll = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((o) => !o);
  };

  const panelStyle: CSSProperties | undefined = box
    ? {
        position: "fixed",
        left: box.left,
        maxWidth: box.maxWidth,
        maxHeight: box.maxHeight,
        zIndex: 10050,
        ...(box.placement === "below"
          ? { top: box.top, bottom: "auto" }
          : { bottom: box.bottom, top: "auto" }),
      }
    : open
      ? {
          position: "fixed",
          left: -9999,
          top: 0,
          visibility: "hidden",
          zIndex: 10050,
        }
      : undefined;

  const panel =
    open &&
    createPortal(
      <div
        ref={panelRef}
        id={panelId}
        className="term-help-popover"
        style={panelStyle}
        role="region"
        aria-labelledby={titleId}
      >
        <div className="term-help-popover-inner">
          <header className="term-help-popover-header">
            <h2 id={titleId} className="term-help-popover-title">
              {dialogTitle}
            </h2>
            <button
              type="button"
              className="term-help-popover-close"
              onClick={close}
              aria-label="Close"
            >
              ×
            </button>
          </header>
          <div className="term-help-popover-body">{children}</div>
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <span ref={wrapRef} className="term-help-wrap">
        <button
          type="button"
          className={`term-help-trigger ${className}`.trim()}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-haspopup="true"
          aria-label={`What is ${termLabel}?`}
        >
          ?
        </button>
      </span>
      {panel}
    </>
  );
}
