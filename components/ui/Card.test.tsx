import { render, screen } from "@testing-library/react";
import { Card, CardBody, CardHeader } from "./Card";

describe("Card", () => {
  test("merges className with base card styles", () => {
    render(
      <Card className="extra" data-testid="card">
        inner
      </Card>,
    );
    const el = screen.getByTestId("card");
    expect(el).toHaveTextContent("inner");
    expect(el.className).toMatch(/rounded-tmb/);
    expect(el.className).toMatch(/extra/);
  });
});

describe("CardHeader", () => {
  test("renders title, optional subtitle, and right slot", () => {
    render(
      <CardHeader
        title="Main"
        subtitle="Secondary"
        right={<button type="button">action</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Main");
    expect(screen.getByText("Secondary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "action" })).toBeInTheDocument();
  });

  test("omits subtitle paragraph when not passed", () => {
    render(<CardHeader title="Only title" />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Only title",
    );
    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument();
  });
});

describe("CardBody", () => {
  test("wraps children with padding classes", () => {
    const { getByText } = render(
      <CardBody className="gap-2">content</CardBody>,
    );
    const el = getByText("content");
    expect(el.className).toMatch(/px-tmb6/);
    expect(el.className).toMatch(/gap-2/);
  });
});
