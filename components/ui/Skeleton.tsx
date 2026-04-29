import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shimmer rounded-tmb", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export function ChartSkeleton({ label }: { label?: string }) {
  return (
    <div className="flex h-full min-h-tmb-chart flex-col gap-tmb4 p-tmb6">
      {label && (
        <div className="text-xs font-bold uppercase tracking-wider text-fg-muted">
          {label}
        </div>
      )}
      <Skeleton className="h-6 w-1/3" />
      <div className="flex-1">
        <Skeleton className="h-full w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
}
