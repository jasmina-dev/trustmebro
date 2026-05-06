"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

type Props = {
  className?: string;
  children: React.ReactNode;
};

/** CTA link with immediate pending state — navigation stays on Link for a11y + prefetch. */
export function DashboardEnterLink({ className, children }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Link
      href="/dashboard"
      prefetch
      aria-busy={pending}
      className={cn(
        className,
        pending && "pointer-events-none cursor-wait opacity-80",
      )}
      onClick={(e) => {
        // Skip when modified-click (open in new tab, etc.).
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        startTransition(() => {
          router.push("/dashboard");
        });
      }}
    >
      {pending ? "Opening…" : children}
    </Link>
  );
}
