// utilized cursor to generate tests

import { render, screen } from "@testing-library/react";
import {
  SuspicionTermHelp,
  WhalesTermHelp,
  NotionalVolumeTermHelp,
} from "./dashboardTermHelp";

vi.mock("./TermHelpIcon", () => ({
  TermHelpIcon: ({
    termLabel,
    dialogTitle,
    children,
  }: {
    termLabel: string;
    dialogTitle: string;
    children: React.ReactNode;
  }) => (
    <section data-testid="term-help-icon">
      <h3>{dialogTitle}</h3>
      <p>{termLabel}</p>
      <div>{children}</div>
    </section>
  ),
}));

describe("dashboardTermHelp wrappers", () => {
  it("renders SuspicionTermHelp with expected title and content", () => {
    render(<SuspicionTermHelp />);
    expect(
      screen.getByRole("heading", { name: /suspicion signal/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the level is computed from your current data slice/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/research heuristic—not evidence of wrongdoing/i),
    ).toBeInTheDocument();
  });

  it("renders WhalesTermHelp with whale explanation content", () => {
    render(<WhalesTermHelp />);
    expect(
      screen.getByRole("heading", { name: /whales \(whale addresses\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/largest takers in the analytics window/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/share of total volume/i)).toBeInTheDocument();
  });

  it("renders NotionalVolumeTermHelp with chart and analytics distinctions", () => {
    render(<NotionalVolumeTermHelp />);
    expect(
      screen.getByRole("heading", { name: /notional volume \(usd\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/trending markets/i)).toBeInTheDocument();
    expect(screen.getByText(/trades analytics/i)).toBeInTheDocument();
  });
});
