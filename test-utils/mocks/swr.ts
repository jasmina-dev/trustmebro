/**
 * Shared SWR mocking helpers.
 *
 * Usage:
 *   import useSWR from "swr";
 *   jest.mock("swr");
 *   (useSWR as jest.Mock).mockImplementation(
 *     swrByKey({
 *       "/api/foo": { data: { data: [] }, isLoading: false },
 *       startsWith: [{ prefix: "/api/markets?", value: { data: { data: [] } } }],
 *     }),
 *   );
 */

type SwrReturn = { data?: any; isLoading?: boolean; error?: any };

export function swrByKey(config: {
  exact?: Record<string, SwrReturn>;
  startsWith?: Array<{ prefix: string; value: SwrReturn }>;
  fallback?: SwrReturn;
}) {
  const exact = config.exact ?? {};
  const starts = config.startsWith ?? [];
  const fallback = config.fallback ?? { data: undefined, isLoading: false };

  return (key: any) => {
    if (typeof key === "string" && exact[key]) return exact[key];
    if (typeof key === "string") {
      for (const rule of starts) {
        if (key.startsWith(rule.prefix)) return rule.value;
      }
    }
    return fallback;
  };
}
