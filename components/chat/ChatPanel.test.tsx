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

  test("Export button is disabled when there are no messages", () => {
    render(<ChatPanel />);
    const exportBtn = screen.getByRole("button", { name: /export/i });
    expect(exportBtn).toBeDisabled();
  });

  test("Export downloads a .txt of the transcript and does not clear messages", async () => {
    const user = userEvent.setup();
    useDashboard.setState({
      chatMessages: [
        {
          id: "u1",
          role: "user",
          content: "Hi",
          createdAt: Date.UTC(2026, 4, 8, 12, 35, 0),
        },
        {
          id: "a1",
          role: "assistant",
          content: "Hello",
          createdAt: Date.UTC(2026, 4, 8, 12, 35, 2),
        },
      ],
    });

    const createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURL,
      configurable: true,
    });

    let capturedText: string | undefined;
    let capturedType: string | undefined;
    const originalBlob = globalThis.Blob;
    class CapturingBlob extends originalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        // jsdom's Blob doesn't implement .text(); capture the raw parts here.
        capturedText = (parts ?? []).map((p) => String(p)).join("");
        capturedType = options?.type;
      }
    }
    Object.defineProperty(globalThis, "Blob", {
      value: CapturingBlob,
      configurable: true,
    });

    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<ChatPanel />);
    await user.click(screen.getByRole("button", { name: /export/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(capturedType).toBe("text/plain;charset=utf-8");
    expect(capturedText).toBeDefined();
    expect(capturedText).toContain("TrustMeBro AI Analyst — Conversation Export");
    expect(capturedText).toContain("Messages: 2");
    expect(capturedText).toContain("You:\nHi");
    expect(capturedText).toContain("Analyst:\nHello");

    // The conversation must NOT be cleared after export.
    expect(useDashboard.getState().chatMessages).toHaveLength(2);

    clickSpy.mockRestore();
    Object.defineProperty(globalThis, "Blob", {
      value: originalBlob,
      configurable: true,
    });
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
