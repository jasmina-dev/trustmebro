import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpTooltip } from "./HelpTooltip";

describe("HelpTooltip", () => {
  test("pointer leave does not close while trigger stays focused", async () => {
    const user = userEvent.setup();
    const { container } = render(<HelpTooltip content="Test explanation" />);
    const wrapper = container.firstElementChild as HTMLElement;
    const button = screen.getByRole("button", {
      name: /show chart explanation/i,
    });

    await user.tab();
    expect(button).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Test explanation");

    fireEvent.pointerLeave(wrapper);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  test("pointer leave closes when focus is not inside", () => {
    const { container } = render(<HelpTooltip content="Hover only" />);
    const wrapper = container.firstElementChild as HTMLElement;

    fireEvent.pointerEnter(wrapper);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.pointerLeave(wrapper);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
