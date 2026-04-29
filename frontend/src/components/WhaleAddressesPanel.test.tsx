// utilized cursor to generate tests

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WhaleAddressesPanel } from "./WhaleAddressesPanel";

describe("WhaleAddressesPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders empty state when there are no whale traders", () => {
    render(<WhaleAddressesPanel data={[]} />);
    expect(
      screen.getByText(/no large traders detected for this selection/i),
    ).toBeInTheDocument();
  });

  it("renders whale rows with truncated addresses, links, and metrics", () => {
    render(
      <WhaleAddressesPanel
        data={[
          {
            address: "abc1234567890abcdef1234567890abcdef1234",
            volume: 5000,
            tradeCount: 12,
            shareOfTotalVolume: 0.5,
          },
          {
            address: "0xdef1234567890abcdef1234567890abcdef5678",
            volume: 2500,
            tradeCount: 7,
            shareOfTotalVolume: 0.25,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("list", { name: /whale trader addresses/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("0xabc1…1234")).toBeInTheDocument();
    expect(screen.getByText("0xdef1…5678")).toBeInTheDocument();
    expect(screen.getByText("$5,000")).toBeInTheDocument();
    expect(screen.getByText("50.0% of window")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /view 0xabc1…1234 on polygon explorer/i,
      }),
    ).toHaveAttribute(
      "href",
      "https://polygonscan.com/address/0xabc1234567890abcdef1234567890abcdef1234",
    );
  });

  it("copies a full address to clipboard and shows copied feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <WhaleAddressesPanel
        data={[
          {
            address: "0xabc1234567890abcdef1234567890abcdef1234",
            volume: 5000,
            tradeCount: 12,
            shareOfTotalVolume: 0.5,
          },
        ]}
      />,
    );

    const copyButton = screen.getByRole("button", { name: /copy address/i });
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(
      "0xabc1234567890abcdef1234567890abcdef1234",
    );
    expect(
      screen.getByRole("button", { name: /copy address/i }),
    ).toHaveTextContent("Copied");
  });

  it("keeps copy label unchanged if clipboard write fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    render(
      <WhaleAddressesPanel
        data={[
          {
            address: "0xabc1234567890abcdef1234567890abcdef1234",
            volume: 5000,
            tradeCount: 12,
            shareOfTotalVolume: 0.5,
          },
        ]}
      />,
    );

    const copyButton = screen.getByRole("button", { name: /copy address/i });
    await user.click(copyButton);
    expect(copyButton).toHaveTextContent("Copy");
  });
});
