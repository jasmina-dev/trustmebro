import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Shown instantly on navigation to `/dashboard` while the route segment loads.
 * Mirrors the dashboard shell so the transition feels responsive.
 */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Loading dashboard">
      <header className="sticky top-0 z-30 border-b border-border bg-bg">
        <div className="border-b border-border bg-bg-card px-tmb7 py-tmb5">
          <div className="mx-auto flex max-w-tmb-header flex-wrap items-start gap-x-tmb8 gap-y-tmb5">
            <div className="space-y-tmb2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <div className="ml-auto flex gap-3">
              <Skeleton className="hidden h-8 w-28 md:block" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </div>
        </div>
        <div className="border-b border-border bg-bg px-tmb7 py-tmb4">
          <div className="mx-auto flex max-w-tmb-header flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-24 rounded-tmb" />
            <Skeleton className="h-8 w-32 rounded-tmb" />
            <Skeleton className="hidden h-8 w-44 rounded-tmb lg:inline-block" />
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-tmb-nav hidden h-tmb-sidebar shrink-0 border-r border-border bg-bg md:block md:w-tmb-sidebar">
          <div className="border-b border-border px-tmb4 py-tmb4">
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="space-y-tmb1 px-tmb2 py-tmb4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-tmb" />
            ))}
          </div>
        </aside>

        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            <div className="grid grid-cols-1 gap-x-tmb7 gap-y-tmb6 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="min-h-[120px] w-full rounded-tmb" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="min-h-tmb-chart w-full rounded-tmb" />
              <Skeleton className="min-h-tmb-chart w-full rounded-tmb" />
            </div>
            <Skeleton className="min-h-tmb-chart w-full rounded-tmb" />
            <Skeleton className="h-24 w-full max-w-xl rounded-tmb" />
          </div>
        </main>
      </div>
    </div>
  );
}
