import { cn } from "@/lib/cn";

/**
 * Small set of shared "card" primitives.
 *
 * @remarks
 * Used throughout the dashboard to keep spacing, borders, and header layouts
 * consistent across charts and KPI modules.
 */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-tmb border border-border bg-bg-card", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  // On phones we let the right-side controls wrap below the title block so
  // long titles don't get squashed against the controls (or worse, push the
  // controls off-screen).
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-tmb5 gap-y-tmb3 border-b border-border px-tmb6 py-tmb5 sm:flex-nowrap max-sm:px-4 max-sm:py-3">
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight text-fg sm:text-lg">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-tmb1 text-xs leading-normal text-fg-muted sm:text-sm">
            {subtitle}
          </p>
        )}
      </div>
      {right && (
        <div className="flex shrink-0 items-center gap-tmb2">{right}</div>
      )}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  // Tighter padding on phones so the chart inside has more horizontal room.
  // Per-chart overrides (e.g. pl-1 pr-3 for recharts) still apply at sm+.
  return (
    <div className={cn("px-tmb6 py-tmb5 max-sm:px-3 max-sm:py-3", className)}>
      {children}
    </div>
  );
}
