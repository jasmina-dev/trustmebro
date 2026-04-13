import { render, screen, within } from "@testing-library/react";
import { MarketList } from "./MarketList";
import type { PolymarketEvent } from "../api/client";

describe("MarketList", () => {
  it("renders empty state when no events are provided", () => {
    render(<MarketList events={[]} />);

    expect(
      screen.getByText(/no events match the selected category/i),
    ).toBeInTheDocument();
  });

  it("renders a Polymarket event link on the title when slug is present", () => {
    const events: PolymarketEvent[] = [
      {
        id: "evt-1",
        slug: "will-fed-cut-rates-this-year",
        title: "Will the Fed cut rates this year?",
        markets: [{ id: "m-1", question: "Yes" }],
      },
    ];

    render(<MarketList events={events} />);

    const titleLink = screen.getByRole("link", {
      name: /will the fed cut rates this year\?/i,
    });
    expect(titleLink).toHaveAttribute(
      "href",
      "https://polymarket.com/event/will-fed-cut-rates-this-year",
    );
    expect(titleLink).toHaveAttribute("target", "_blank");
    expect(titleLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a Kalshi event link when the source is kalshi", () => {
    const events: PolymarketEvent[] = [
      {
        id: "kalshi-1",
        source: "kalshi",
        slug: "KALSHI-ABC",
        title: "Will unemployment rise?",
        markets: [
          {
            id: "KALSHI-ABC",
            question: "Will unemployment rise?",
            source: "kalshi",
          },
        ],
      },
    ];

    render(<MarketList events={events} />);

    const titleLink = screen.getByRole("link", {
      name: /will unemployment rise\?/i,
    });
    expect(titleLink).toHaveAttribute(
      "href",
      "https://kalshi.com/markets/kalshi/kalshi-abc",
    );
  });

  it("renders plain title text when slug is missing", () => {
    const events: PolymarketEvent[] = [
      {
        id: "evt-2",
        title: "Will inflation fall below 2%?",
        markets: [{ id: "m-2", question: "Yes" }],
      },
    ];

    render(<MarketList events={events} />);

    expect(
      screen.queryByRole("link", { name: /will inflation fall below 2%\?/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /will inflation fall below 2%\?/i }),
    ).toBeInTheDocument();
  });

  it("truncates long descriptions with an ellipsis", () => {
    const longDescription = "A".repeat(140);
    const events: PolymarketEvent[] = [
      {
        id: "evt-3",
        title: "Long description event",
        description: longDescription,
        markets: [{ id: "m-3", question: "Yes" }],
      },
    ];

    render(<MarketList events={events} />);

    const expected = `${longDescription.slice(0, 120)}…`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows full description when length is 120 characters or less", () => {
    const shortDescription = "B".repeat(120);
    const events: PolymarketEvent[] = [
      {
        id: "evt-4",
        title: "Short description event",
        description: shortDescription,
        markets: [{ id: "m-4", question: "Yes" }],
      },
    ];

    render(<MarketList events={events} />);

    expect(screen.getByText(shortDescription)).toBeInTheDocument();
  });

  it("formats volume thresholds correctly", () => {
    const events: PolymarketEvent[] = [
      {
        id: "vol-0",
        title: "No volume",
        markets: [{ id: "m-v0", question: "Yes" }],
      },
      {
        id: "vol-999",
        title: "Small volume",
        markets: [{ id: "m-v1", question: "Yes", volumeNum: 999 }],
      },
      {
        id: "vol-1500",
        title: "K volume",
        markets: [{ id: "m-v2", question: "Yes", volumeNum: 1500 }],
      },
      {
        id: "vol-2m",
        title: "M volume",
        markets: [{ id: "m-v3", question: "Yes", volumeNum: 2_000_000 }],
      },
    ];

    render(<MarketList events={events} />);

    expect(screen.getByText("Vol: —")).toBeInTheDocument();
    expect(screen.getByText("Vol: $999")).toBeInTheDocument();
    expect(screen.getByText("Vol: $1.5k")).toBeInTheDocument();
    expect(screen.getByText("Vol: $2.00M")).toBeInTheDocument();
  });

  it("parses yes price from array, JSON string, CSV string, and invalid values", () => {
    const events: PolymarketEvent[] = [
      {
        id: "price-arr",
        title: "Array price",
        markets: [
          {
            id: "m-pa",
            question: "Yes",
            outcomePrices: [0.42] as unknown as string,
          },
        ],
      },
      {
        id: "price-json",
        title: "JSON string price",
        markets: [
          { id: "m-pj", question: "Yes", outcomePrices: "[0.77,0.23]" },
        ],
      },
      {
        id: "price-csv",
        title: "CSV string price",
        markets: [{ id: "m-pc", question: "Yes", outcomePrices: "0.31,0.69" }],
      },
      {
        id: "price-bad",
        title: "Invalid price",
        markets: [
          { id: "m-pb", question: "Yes", outcomePrices: "not-a-number" },
        ],
      },
    ];

    render(<MarketList events={events} />);

    expect(screen.getByText("Yes: 42¢")).toBeInTheDocument();
    expect(screen.getByText("Yes: 77¢")).toBeInTheDocument();
    expect(screen.getByText("Yes: 31¢")).toBeInTheDocument();
    expect(screen.getByText("Yes: —")).toBeInTheDocument();
  });

  it("shows yes price only when at least one market exists", () => {
    const events: PolymarketEvent[] = [
      {
        id: "price-none",
        title: "No market",
      },
      {
        id: "price-empty",
        title: "Empty market array",
        markets: [],
      },
      {
        id: "price-present",
        title: "Market present",
        markets: [{ id: "m-present", question: "Yes", outcomePrices: "0.5" }],
      },
    ];

    render(<MarketList events={events} />);

    expect(screen.getByText("Yes: 50¢")).toBeInTheDocument();
    expect(screen.getAllByText(/vol:/i)).toHaveLength(3);
    expect(screen.getAllByText(/yes:/i)).toHaveLength(1);
  });

  it("deduplicates and orders tags across event and market categories", () => {
    const events: PolymarketEvent[] = [
      {
        id: "tag-1",
        title: "Tag ordering",
        tmCategories: ["crypto", "Politics", "economy"],
        markets: [
          {
            id: "m-tag",
            question: "Yes",
            tmCategories: ["Politics", "Climate", "CRYPTO"],
          },
        ],
      },
    ];

    render(<MarketList events={events} />);

    const heading = screen.getByRole("heading", { name: /tag ordering/i });
    const cardHead = heading.closest(".market-card-head");
    expect(cardHead).not.toBeNull();
    const tags = within(cardHead as HTMLElement)
      .getAllByRole("listitem")
      .map((el) => el.textContent?.trim());

    expect(tags).toEqual(["Politics", "economy", "crypto", "Climate"]);
  });

  it("applies expected category class names to tags", () => {
    const events: PolymarketEvent[] = [
      {
        id: "tag-class",
        title: "Tag classes",
        tmCategories: ["Politics", "Economy", "Other"],
        markets: [{ id: "m-tag-class", question: "Yes" }],
      },
    ];

    render(<MarketList events={events} />);

    expect(screen.getByText("Politics")).toHaveClass("event-tag--politics");
    expect(screen.getByText("Economy")).toHaveClass("event-tag--economy");
    expect(screen.getByText("Other")).toHaveClass("event-tag--other");
  });
});
