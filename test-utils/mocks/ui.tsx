import React from "react";

/**
 * Shared UI module mocks for component tests.
 *
 * Usage:
 *   jest.mock("../ui/Card", () => require("@/test-utils/mocks/ui").mockCardModule());
 *   jest.mock("../ui/Skeleton", () => require("@/test-utils/mocks/ui").mockSkeletonModule());
 *   jest.mock("../ui/HelpTooltip", () => require("@/test-utils/mocks/ui").mockHelpTooltipModule());
 */

export function mockCardModule() {
  return {
    Card: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    CardBody: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    CardHeader: ({
      title,
      subtitle,
      right,
    }: {
      title: string;
      subtitle?: string;
      right?: React.ReactNode;
    }) => (
      <div>
        <div>{title}</div>
        {subtitle ? <div data-testid="subtitle">{subtitle}</div> : null}
        {right}
      </div>
    ),
  };
}

export function mockSkeletonModule() {
  return { ChartSkeleton: () => <div>loading</div> };
}

export function mockHelpTooltipModule() {
  return { HelpTooltip: () => null };
}
