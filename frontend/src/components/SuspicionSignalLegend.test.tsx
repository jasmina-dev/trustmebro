// utilized cursor to generate tests

import { render, screen } from "@testing-library/react";
import { SuspicionSignalLegend } from "./SuspicionSignalLegend";
import { SUSPICION_SIGNAL_DISCLAIMER } from "./suspicion";

vi.mock("./dashboardTermHelp", () => ({
  SuspicionTermHelp: () => <span data-testid="suspicion-help" />,
}));

describe("SuspicionSignalLegend", () => {
  it("renders heading, key levels, helper, and disclaimer", () => {
    render(<SuspicionSignalLegend />);

    expect(
      screen.getByLabelText(
        /suspicion signal levels for trending market bars/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/suspicion signal key/i)).toBeInTheDocument();
    expect(screen.getByTestId("suspicion-help")).toBeInTheDocument();
    expect(screen.getByText(/🔴 HIGH/i)).toBeInTheDocument();
    expect(screen.getByText(/🟡 MED/i)).toBeInTheDocument();
    expect(screen.getByText(/🟢 LOW/i)).toBeInTheDocument();
    expect(screen.getByText(SUSPICION_SIGNAL_DISCLAIMER)).toBeInTheDocument();
  });
});
