/**
 * Minimal `cn` — join truthy class names with spaces.
 * Intentionally dependency-free (tailwind-merge isn't worth the bundle here).
 */
export function cn(...values: Array<string | undefined | null | false>): string {
  return values.filter(Boolean).join(" ");
}
