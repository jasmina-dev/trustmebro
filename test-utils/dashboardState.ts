import { useDashboard } from "@/lib/store";

/**
 * Consistent baseline dashboard state for component tests.
 * Call in beforeEach().
 */
export function resetDashboardState(
  overrides: Partial<ReturnType<typeof useDashboard.getState>> = {},
) {
  useDashboard.setState({
    activeVenue: "all",
    activeCategory: "All",
    activeChart: "overview",
    dateRange: {
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-31T00:00:00.000Z",
    },
    chatOpen: false,
    chatMessages: [],
    chatStreaming: false,
    visibleMarkets: [],
    inefficiencyScores: [],
    resolutionStats: [],
    ...overrides,
  });
}
