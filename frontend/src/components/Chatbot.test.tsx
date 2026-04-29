// utilized cursor to generate tests

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chatbot } from "./Chatbot";
import { streamChatMessage } from "../api/client";

vi.mock("../api/client", () => ({
  streamChatMessage: vi.fn(),
}));

const streamChatMessageMock = vi.mocked(streamChatMessage);

describe("Chatbot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders initial assistant state and disabled controls", () => {
    render(<Chatbot onClose={vi.fn()} dashboardContext={null} />);

    expect(
      screen.getByRole("dialog", { name: /ai assistant chat/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /ask the assistant/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/trustmebro assistant/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^clear chat$/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
  });

  it("builds prompt starters from dashboard context", () => {
    render(
      <Chatbot
        onClose={vi.fn()}
        dashboardContext={[
          "Active tab: Trade flow",
          "Focused event: Election 2028",
          "Active filter: Politics",
          "Volume filter: > $100k",
        ].join("\n")}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /interpret the current trade-flow trend/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /break down why "election 2028" looks interesting right now/i,
      }),
    ).toBeInTheDocument();
    const startersPanel = screen.getByLabelText(/suggested prompts/i);
    expect(startersPanel.querySelectorAll("button")).toHaveLength(4);
  });

  it("sends typed message, streams chunks, and includes dashboard context/history", async () => {
    const user = userEvent.setup();

    streamChatMessageMock.mockImplementation(async (_message, onChunk) => {
      onChunk("First ");
      onChunk("second");
    });

    render(
      <Chatbot
        onClose={vi.fn()}
        dashboardContext={"Active tab: Markets\nFocused event: Fed decision"}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /chat message/i }),
      "Hi",
    );
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByText("First second")).toBeInTheDocument();
    });
    expect(streamChatMessageMock).toHaveBeenCalledTimes(1);
    const [message, , context, history, signal] =
      streamChatMessageMock.mock.calls[0];
    expect(message).toBe("Hi");
    expect(context).toContain("Focused event: Fed decision");
    expect(history).toEqual([
      expect.objectContaining({
        role: "assistant",
        content: expect.stringContaining("TrustMeBro assistant"),
      }),
    ]);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(screen.getByRole("textbox", { name: /chat message/i })).toHaveValue(
      "",
    );
  });

  it("shows loading state and disables starters while request is in flight", async () => {
    const user = userEvent.setup();
    let resolveStream: (() => void) | undefined;
    streamChatMessageMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStream = () => resolve();
        }),
    );

    render(
      <Chatbot
        onClose={vi.fn()}
        dashboardContext={"Active tab: Markets\n- Top market: $999,999"}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: /quick summary/i })[0],
    );

    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /quick summary/i })[0],
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();

    expect(resolveStream).toBeDefined();
    resolveStream!();

    await waitFor(() => {
      expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    });
  });

  it("shows fallback assistant and alert on non-abort errors", async () => {
    const user = userEvent.setup();
    streamChatMessageMock.mockRejectedValue(new Error("Backend unavailable"));

    render(<Chatbot onClose={vi.fn()} dashboardContext={null} />);

    await user.type(
      screen.getByRole("textbox", { name: /chat message/i }),
      "What changed?",
    );
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Backend unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/sorry, i couldn't respond: backend unavailable/i),
    ).toBeInTheDocument();
  });

  it("ignores abort errors without showing an alert", async () => {
    const user = userEvent.setup();
    const abortError = new Error("Request aborted");
    abortError.name = "AbortError";
    streamChatMessageMock.mockRejectedValue(abortError);

    render(<Chatbot onClose={vi.fn()} dashboardContext={null} />);

    await user.type(
      screen.getByRole("textbox", { name: /chat message/i }),
      "Hello",
    );
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("clears chat and aborts in-flight request", async () => {
    const user = userEvent.setup();
    let capturedSignal: AbortSignal | undefined;
    streamChatMessageMock.mockImplementation(
      async (_message, _onChunk, _context, _history, signal) => {
        capturedSignal = signal;
        await new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    );

    render(<Chatbot onClose={vi.fn()} dashboardContext={null} />);

    await user.type(
      screen.getByRole("textbox", { name: /chat message/i }),
      "Ping",
    );
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    await user.click(screen.getByRole("button", { name: /^clear chat$/i }));

    expect(capturedSignal?.aborted).toBe(true);
    expect(
      screen.getByRole("button", { name: /^clear chat$/i }),
    ).toBeDisabled();
    expect(screen.getByText(/trustmebro assistant/i)).toBeInTheDocument();
  });

  it("toggles fullscreen and exits fullscreen on Escape", async () => {
    const user = userEvent.setup();
    render(<Chatbot onClose={vi.fn()} dashboardContext={null} />);

    const toggleButton = screen.getByRole("button", {
      name: /open chat in full screen/i,
    });
    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("dialog")).toHaveClass("fullscreen");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(toggleButton).toHaveAttribute("aria-pressed", "false");
    });
    expect(screen.getByRole("dialog")).not.toHaveClass("fullscreen");
  });

  it("aborts in-flight request when chat is closed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let capturedSignal: AbortSignal | undefined;
    streamChatMessageMock.mockImplementation(
      async (_message, _onChunk, _context, _history, signal) => {
        capturedSignal = signal;
        await new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    );

    render(<Chatbot onClose={onClose} dashboardContext={null} />);

    await user.type(
      screen.getByRole("textbox", { name: /chat message/i }),
      "Close now",
    );
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    await user.click(screen.getByRole("button", { name: /^close chat$/i }));

    expect(capturedSignal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
