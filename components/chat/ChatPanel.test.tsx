import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextDecoder, TextEncoder } from "util";
import { ChatPanel } from "./ChatPanel";
import { useDashboard } from "@/lib/store";

function restoreProperty(
  target: object,
  key: string,
  desc: PropertyDescriptor | undefined,
) {
  if (desc) {
    Object.defineProperty(target, key, desc);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

describe("ChatPanel", () => {
  let cryptoDesc: PropertyDescriptor | undefined;
  let textEncoderDesc: PropertyDescriptor | undefined;
  let textDecoderDesc: PropertyDescriptor | undefined;
  let scrollIntoViewDesc: PropertyDescriptor | undefined;
  let fetchDesc: PropertyDescriptor | undefined;

  beforeEach(() => {
    cryptoDesc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    textEncoderDesc = Object.getOwnPropertyDescriptor(
      globalThis,
      "TextEncoder",
    );
    textDecoderDesc = Object.getOwnPropertyDescriptor(
      globalThis,
      "TextDecoder",
    );
    scrollIntoViewDesc = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollIntoView",
    );
    fetchDesc = Object.getOwnPropertyDescriptor(globalThis, "fetch");

    useDashboard.setState({
      activeVenue: "all",
      activeCategory: "All",
      activeChart: "overview",
      dateRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-31T00:00:00.000Z",
      },
      chatOpen: true,
      chatMessages: [],
      chatStreaming: false,
      visibleMarkets: [],
      inefficiencyScores: [],
      resolutionStats: [],
    });
    let id = 0;
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => `id-${++id}` },
      configurable: true,
    });
    Object.defineProperty(globalThis, "TextEncoder", {
      value: TextEncoder,
      configurable: true,
    });
    Object.defineProperty(globalThis, "TextDecoder", {
      value: TextDecoder,
      configurable: true,
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: jest.fn(),
      configurable: true,
    });
  });

  afterEach(() => {
    restoreProperty(globalThis, "crypto", cryptoDesc);
    restoreProperty(globalThis, "TextEncoder", textEncoderDesc);
    restoreProperty(globalThis, "TextDecoder", textDecoderDesc);
    restoreProperty(Element.prototype, "scrollIntoView", scrollIntoViewDesc);
    restoreProperty(globalThis, "fetch", fetchDesc);
  });

  test("shows suggested prompts when chat is empty", () => {
    render(<ChatPanel />);
    expect(
      screen.getByText("Why do sports markets skew toward NO?"),
    ).toBeInTheDocument();
  });

  test("submits message and appends stream chunks", async () => {
    const user = userEvent.setup();
    const encoder = new TextEncoder();
    const chunks = [encoder.encode("Hello "), encoder.encode("world")];

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({ done: false, value: chunks[0] })
            .mockResolvedValueOnce({ done: false, value: chunks[1] })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      },
    } as unknown as Response);
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
    });

    render(<ChatPanel />);
    await user.type(
      screen.getByPlaceholderText("Ask about the dashboard…"),
      "Hi",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        useDashboard.getState().chatMessages.length,
      ).toBeGreaterThanOrEqual(2);
    });
    expect(useDashboard.getState().chatMessages[0].content).toBe("Hi");
    expect(useDashboard.getState().chatMessages[1].content).toBe("Hello world");
    expect(fetchMock).toHaveBeenCalled();
  });
});
