// utilized cursor to generate tests

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { Dashboard } from "./Dashboard";
import { fetchEvents, fetchMarkets, fetchTradesAnalytics } from "../api/client";
import {
  loadTrimmedCashflowBuckets,
  applyWindowToAnalytics,
  buildMinimalAnalytics,
} from "../lib/demoCashflowStore";

vi.mock("./MarketList", () => ({
  MarketList: ({ events }: { events: Array<{ id: string }> }) => (
    <div data-testid="market-list">events:{events.length}</div>
  ),
}));

vi.mock("./TrendChart", () => ({
  TrendChart: ({
    data,
    onBarClick,
  }: {
    data: Array<{ eventId: string; fullName?: string; name: string }>;
    onBarClick: (eventId: string) => void;
  }) => (
    <div data-testid="trend-chart">
      {data.map((row) => (
        <button key={row.eventId} onClick={() => onBarClick(row.eventId)}>
          {row.fullName ?? row.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./TradesTimeSeriesChart", () => ({
  TradesTimeSeriesChart: ({
    loading,
    data,
  }: {
    loading?: boolean;
    data: unknown[];
  }) => (
    <div data-testid="timeseries-chart">
      {loading ? "loading" : `points:${data.length}`}
    </div>
  ),
}));

vi.mock("./PreDeadlineChart", () => ({
  PreDeadlineChart: () => <div data-testid="predeadline-chart" />,
}));

vi.mock("./WhaleAddressesPanel", () => ({
  WhaleAddressesPanel: ({ data }: { data: unknown[] }) => (
    <div data-testid="whale-panel">whales:{data.length}</div>
  ),
}));

vi.mock("./SuspicionSignalLegend", () => ({
  SuspicionSignalLegend: () => <div data-testid="suspicion-legend" />,
}));

vi.mock("./dashboardTermHelp", () => ({
  SuspicionTermHelp: () => <span data-testid="suspicion-help" />,
  WhalesTermHelp: () => <span data-testid="whales-help" />,
}));

vi.mock("./suspicion", () => ({
  computeEventSuspicion: vi.fn(() => "low"),
}));

vi.mock("../lib/supabaseClient", () => ({
  isSupabaseChartsConfigured: vi.fn(() => false),
}));

vi.mock("../lib/supabaseCandles", () => ({
  fetchGlobalHourlyCashflowFromSupabase: vi.fn(async () => []),
  fetchHourlyCashflowForPolymarketIds: vi.fn(async () => []),
}));

vi.mock("../lib/demoCashflowStore", () => ({
  CASHFLOW_PERSIST_LOOKBACK_HOURS: 24 * 7,
  loadTrimmedCashflowBuckets: vi.fn(() => []),
  saveStoredBuckets: vi.fn(),
  mergeBucketSeries: vi.fn((_a, b) => b),
  trimBucketsToLookback: vi.fn((b) => b),
  generateDemoHourlyBuckets: vi.fn(() => []),
  buildMinimalAnalytics: vi.fn(),
  applyWindowToAnalytics: vi.fn(),
  densifyHourlyWindow: vi.fn((b) => b),
}));

vi.mock("../api/client", () => ({
  fetchEvents: vi.fn(),
  fetchMarkets: vi.fn(),
  fetchTradesAnalytics: vi.fn(),
  getSourceEventUrl: vi.fn((_source, event: { slug?: string }) =>
    event.slug ? `https://polymarket.com/event/${event.slug}` : undefined,
  ),
  getSourceMarketUrl: vi.fn(
    (_source, market: { slug?: string; id?: string }) =>
      market
        ? `https://polymarket.com/market/${market.slug ?? market.id ?? ""}`
        : undefined,
  ),
}));

const fetchEventsMock = vi.mocked(fetchEvents);
const fetchMarketsMock = vi.mocked(fetchMarkets);
const fetchTradesAnalyticsMock = vi.mocked(fetchTradesAnalytics);
const loadTrimmedCashflowBucketsMock = vi.mocked(loadTrimmedCashflowBuckets);
const applyWindowToAnalyticsMock = vi.mocked(applyWindowToAnalytics);
const buildMinimalAnalyticsMock = vi.mocked(buildMinimalAnalytics);

const analyticsFixture = {
  totalTrades: 12,
  totalVolume: 12000,
  uniqueTraders: 3,
  uniqueMarkets: 2,
  timeRange: {
    earliest: "2026-01-01T00:00:00Z",
    latest: "2026-01-02T00:00:00Z",
  },
  byTime: [
    {
      bucketStart: "2026-01-01T00:00:00Z",
      bucketEnd: "2026-01-01T01:00:00Z",
      volume: 1000,
      tradeCount: 2,
    },
  ],
  perMarket: [{ conditionId: "cond-a", volume: 12000, tradeCount: 12 }],
  whaleTraders: [
    {
      address: "0xabc",
      volume: 4000,
      tradeCount: 3,
      shareOfTotalVolume: 0.33,
    },
  ],
  preDeadlineWindow: {
    windowHours: 24,
    windowStart: "2026-01-01T00:00:00Z",
    windowEnd: "2026-01-02T00:00:00Z",
    volume: 5000,
    tradeCount: 4,
    shareOfTotalVolume: 0.4,
  },
};

const eventsFixture = [
  {
    id: "evt-1",
    title: "Election 2028",
    slug: "election-2028",
    tmCategories: ["Politics"],
    markets: [{ id: "m1", question: "Yes", volumeNum: 200000, slug: "m1" }],
  },
  {
    id: "evt-2",
    title: "BTC above 100k",
    slug: "btc-above-100k",
    tmCategories: ["Crypto"],
    markets: [{ id: "m2", question: "Yes", volumeNum: 1000, slug: "m2" }],
  },
];

function renderDashboard(
  overrides?: Partial<ComponentProps<typeof Dashboard>>,
) {
  return render(
    <Dashboard
      source="polymarket"
      category="all"
      onCategoryChange={vi.fn()}
      categoryOptions={[
        { id: "all", label: "All" },
        { id: "politics", label: "Politics" },
      ]}
      {...overrides}
    />,
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    loadTrimmedCashflowBucketsMock.mockReturnValue([]);
    fetchEventsMock.mockResolvedValue(eventsFixture);
    fetchMarketsMock.mockResolvedValue([
      { id: "m1", eventId: "evt-1", question: "Yes", volumeNum: 200000 },
      { id: "m2", eventId: "evt-2", question: "Yes", volumeNum: 1000 },
    ]);
    fetchTradesAnalyticsMock.mockResolvedValue({
      analytics: analyticsFixture,
      count: 1,
    });
    applyWindowToAnalyticsMock.mockImplementation((raw) => raw);
    buildMinimalAnalyticsMock.mockReturnValue(analyticsFixture);
  });

  it("shows loading then renders dashboard data", async () => {
    renderDashboard();
    expect(screen.getByText(/loading market data/i)).toBeInTheDocument();

    expect(await screen.findByText(/live spotlight/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^markets$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^top markets$/i, level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /election 2028/i }),
    ).toBeInTheDocument();
  });

  it("renders error state when event/market loading fails", async () => {
    fetchEventsMock.mockRejectedValueOnce(new Error("API down"));
    renderDashboard();

    expect(await screen.findByText("API down")).toBeInTheDocument();
    expect(
      screen.getByText(/ensure the backend is running \(default: port 5001\)/i),
    ).toBeInTheDocument();
  });

  it("dismisses onboarding banner and persists dismissal", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(
      await screen.findByLabelText(/dashboard introduction/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    await waitFor(() => {
      expect(
        screen.queryByLabelText(/dashboard introduction/i),
      ).not.toBeInTheDocument();
    });
    expect(
      localStorage.getItem("trustmebro:dashboard:onboarding-dismissed:v1"),
    ).toBe("1");
  });

  it("invokes category callback and updates filter controls", async () => {
    const user = userEvent.setup();
    const onCategoryChange = vi.fn();
    renderDashboard({ onCategoryChange });
    await screen.findByText(/live spotlight/i);

    const categorySelect = screen.getByRole("combobox", { name: /category/i });
    await user.selectOptions(categorySelect, "politics");

    expect(onCategoryChange).toHaveBeenCalledWith("politics");
    expect(screen.getByRole("combobox", { name: /time window/i })).toHaveValue(
      "24",
    );
    expect(screen.getByRole("combobox", { name: /volume/i })).toHaveValue(
      "any",
    );
  });

  it("switches tabs and shows tab-specific content", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(/live spotlight/i);

    await user.click(screen.getByRole("button", { name: /news & sentiment/i }));
    expect(
      screen.getByRole("heading", { name: /news & sentiment/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /first time user/i }));
    expect(
      screen.getByRole("heading", { name: /first time user guide/i }),
    ).toBeInTheDocument();
  });

  it("toggles deep analysis and events accordion sections", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText(/live spotlight/i);

    const deepToggle = screen.getByRole("button", {
      name: /show deep analysis/i,
    });
    await user.click(deepToggle);
    expect(
      screen.getByRole("heading", { name: /trading activity & whales/i }),
    ).toBeInTheDocument();

    const eventsAccordion = screen.getByRole("button", {
      name: /events & markets/i,
    });
    await user.click(eventsAccordion);
    expect(screen.getByTestId("market-list")).toHaveTextContent("events:2");
  });

  it("updates focused event from top market click and clears focus", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("button", { name: /election 2028/i });
    await user.click(screen.getByRole("button", { name: /election 2028/i }));
    expect(screen.getByText(/focused:/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^clear$/i })[0],
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /^clear$/i })[0]);
    await waitFor(() => {
      expect(screen.queryByText(/focused:/i)).not.toBeInTheDocument();
    });
  });

  it("emits dashboard context after loading", async () => {
    const onContextChange = vi.fn();
    renderDashboard({ onContextChange });

    await waitFor(() => {
      expect(onContextChange).toHaveBeenCalled();
    });

    const latest =
      onContextChange.mock.calls[onContextChange.mock.calls.length - 1]?.[0] as
        string;
    expect(latest).toContain("Active source: Polymarket");
    expect(latest).toContain("Active tab: Markets");
    expect(latest).toContain("Top markets by volume:");
    expect(latest).toContain("Election 2028");
  });
});
