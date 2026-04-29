import { cn } from "@/lib/cn";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-tmb border border-border bg-bg-card",
        className,
      )}
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
  return (
    <div className="flex items-start justify-between gap-tmb5 border-b border-border px-tmb6 py-tmb5">
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-fg">{title}</h3>
        {subtitle && (
          <p className="mt-tmb1 text-sm leading-normal text-fg-muted">
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
  return <div className={cn("px-tmb6 py-tmb5", className)}>{children}</div>;
}
