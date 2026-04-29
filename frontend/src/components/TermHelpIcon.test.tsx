// utilized cursor to generate tests

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TermHelpIcon } from "./TermHelpIcon";

describe("TermHelpIcon", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens and closes the popover via trigger and close button", async () => {
    const user = userEvent.setup();
    render(
      <TermHelpIcon termLabel="Whales" dialogTitle="Whales details">
        <p>Body content</p>
      </TermHelpIcon>,
    );

    const trigger = screen.getByRole("button", { name: /what is whales\?/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("region", { name: /whales details/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(
      screen.queryByRole("region", { name: /whales details/i }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on outside click and Escape", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Outside</button>
        <TermHelpIcon termLabel="Signal" dialogTitle="Signal details">
          <p>Signal body</p>
        </TermHelpIcon>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /what is signal\?/i }));
    expect(
      screen.getByRole("region", { name: /signal details/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /outside/i }));
    expect(
      screen.queryByRole("region", { name: /signal details/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /what is signal\?/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("region", { name: /signal details/i }),
    ).not.toBeInTheDocument();
  });

  it("updates popover position on resize and scroll while open", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    render(
      <TermHelpIcon termLabel="Notional volume" dialogTitle="Notional volume">
        <p>NV body</p>
      </TermHelpIcon>,
    );

    const trigger = screen.getByRole("button", {
      name: /what is notional volume\?/i,
    });
    await user.click(trigger);

    expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true);

    fireEvent.resize(window);
    fireEvent.scroll(window);

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      true,
    );
  });
});
