import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./Sidebar";
import { useDashboard } from "@/lib/store";
import { resetDashboardState } from "@/test-utils/dashboardState";

/**
 * The desktop and mobile rails render the same set of section labels.
 * Scoping queries to the labelled desktop landmark keeps lookups unambiguous
 * even if a future test opens the mobile drawer (which would otherwise put
 * a second copy of every section button into the accessibility tree).
 */
function getDesktopRail() {
  return within(
    screen.getByRole("complementary", { name: "Dashboard sections" }),
  );
}

function getDesktopButton(name: string) {
  return getDesktopRail().getByRole("button", { name });
}

/**
 * Component tests for `Sidebar`.
 *
 * @remarks
 * Sidebar coordinates navigation state (active chart) and a few DOM behaviors
 * (scrolling to chart sections). These tests assert on store updates and the
 * expected scroll hook without coupling to layout details.
 */
/**
 * Cases drawn from the live dashboard layout — the sidebar's button labels
 * and the section IDs they should scroll to. Kept in lockstep with
 * `app/dashboard/page.tsx`.
 */
const SECTION_CASES: Array<{ buttonName: string; sectionId: string }> = [
  { buttonName: "Overview", sectionId: "overview" },
  { buttonName: "Resolution bias", sectionId: "resolution-bias-heatmap" },
  { buttonName: "Cross-venue divergence", sectionId: "cross-venue-divergence" },
  { buttonName: "Market momentum", sectionId: "market-momentum" },
  { buttonName: "Calibration curve", sectionId: "calibration" },
  { buttonName: "Efficiency timeline", sectionId: "efficiency-timeline" },
  { buttonName: "Liquidity gap", sectionId: "liquidity-gap" },
  { buttonName: "Price vs resolution", sectionId: "price-vs-resolution" },
  { buttonName: "Leaderboard", sectionId: "leaderboard" },
  { buttonName: "First-time users", sectionId: "first-time-users" },
];

/** Tracks DOM nodes we mount so afterEach can detach only what we added. */
const mountedNodes: HTMLElement[] = [];

/** Builds a section element with a stubbed `scrollIntoView` and inserts it. */
function mountSection(id: string) {
  const el = document.createElement("div");
  el.id = id;
  el.scrollIntoView = jest.fn();
  document.body.appendChild(el);
  mountedNodes.push(el);
  return el;
}

/**
 * Stand-in for the dashboard's `<TopNav>`. The real header is `position:
 * sticky`, so the sidebar must offset `scrollIntoView` by its rendered
 * height. We return a fixed height so the offset assertion is deterministic.
 */
function mountStickyHeader(height: number) {
  const header = document.createElement("header");
  header.getBoundingClientRect = () =>
    ({
      height,
      width: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(header);
  mountedNodes.push(header);
  return header;
}

/**
 * Replaces an element's `getBoundingClientRect` with a mutable stub so
 * tests can simulate the rect changing across scroll/resize events.
 */
function stubRect(
  el: HTMLElement,
  initial: { top: number; height: number; right: number; width?: number },
) {
  let current = initial;
  el.getBoundingClientRect = () =>
    ({
      top: current.top,
      height: current.height,
      right: current.right,
      width: current.width ?? 200,
      bottom: current.top + current.height,
      left: current.right - (current.width ?? 200),
      x: current.right - (current.width ?? 200),
      y: current.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return (next: typeof initial) => {
    current = next;
  };
}

describe("Sidebar", () => {
  beforeEach(() => {
    resetDashboardState();
  });

  afterEach(() => {
    while (mountedNodes.length > 0) {
      mountedNodes.pop()?.remove();
    }
  });

  test("collapses and expands sidebar", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByLabelText("Collapse sidebar"));
    expect(screen.getByLabelText("Expand sidebar")).toBeInTheDocument();
  });

  test("sets active chart and scrolls to section", async () => {
    const user = userEvent.setup();
    const el = mountSection("leaderboard");

    render(<Sidebar />);
    await user.click(getDesktopButton("Leaderboard"));

    expect(useDashboard.getState().activeChart).toBe("leaderboard");
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  test.each(SECTION_CASES)(
    "navigates to the matching #$sectionId when '$buttonName' is clicked",
    async ({ buttonName, sectionId }) => {
      const user = userEvent.setup();
      const el = mountSection(sectionId);

      render(<Sidebar />);
      await user.click(getDesktopButton(buttonName));

      expect(useDashboard.getState().activeChart).toBe(sectionId);
      expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    },
  );

  test("offsets scroll target by the sticky header height so the section heading isn't hidden", async () => {
    const user = userEvent.setup();
    mountStickyHeader(124);
    const el = mountSection("market-momentum");

    render(<Sidebar />);
    await user.click(getDesktopButton("Market momentum"));

    expect(el.style.scrollMarginTop).toBe("132px");
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  test("does not throw when the target section is not in the DOM", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await expect(
      user.click(getDesktopButton("Calibration curve")),
    ).resolves.not.toThrow();
    expect(useDashboard.getState().activeChart).toBe("calibration");
  });

  test("section-button queries stay unambiguous even when the mobile drawer is open", async () => {
    // Stub matchMedia so the auto-dismiss effect doesn't blow up under jsdom.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    useDashboard.setState({ sidebarOpen: true });
    const el = mountSection("overview");

    render(<Sidebar />);
    // Without the dedicated `aria-label` on the desktop rail, this would now
    // resolve to two matches (desktop + mobile) and throw.
    const user = userEvent.setup();
    await user.click(getDesktopButton("Overview"));

    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  test("shows description tooltip on hover and hides on leave", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const button = getDesktopButton("Resolution bias");
    await user.hover(button);

    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Category × venue NO-rate heatmap");

    await user.unhover(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("repositions the tooltip when the page (or sidebar nav) scrolls while it's open", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const button = getDesktopButton("Resolution bias");
    const setRect = stubRect(button, { top: 100, height: 40, right: 200 });

    await user.hover(button);
    const tip = await screen.findByRole("tooltip");
    // Initial position derives from the trigger rect:
    //   top  = rect.top + rect.height/2 = 100 + 20 = 120px
    //   left = rect.right + 8           = 200 + 8 = 208px
    expect(tip).toHaveStyle({ top: "120px", left: "208px" });

    // Simulate the inner sidebar `<nav>` scrolling 60px upwards. The button
    // moves with it; without a scroll listener the tooltip would be stale.
    setRect({ top: 40, height: 40, right: 200 });
    fireEvent.scroll(document);

    expect(tip).toHaveStyle({ top: "60px", left: "208px" });
  });

  test("repositions the tooltip on window resize", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const button = getDesktopButton("Calibration curve");
    const setRect = stubRect(button, { top: 200, height: 40, right: 240 });

    await user.hover(button);
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveStyle({ top: "220px", left: "248px" });

    // Simulate a viewport resize that shifts the trigger horizontally.
    setRect({ top: 200, height: 40, right: 320 });
    fireEvent(window, new Event("resize"));

    expect(tip).toHaveStyle({ top: "220px", left: "328px" });
  });

  test("stops responding to scroll events after the tooltip is closed", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const button = getDesktopButton("Liquidity gap");
    const setRect = stubRect(button, { top: 100, height: 40, right: 200 });

    await user.hover(button);
    await screen.findByRole("tooltip");
    await user.unhover(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // After unhover, scroll events shouldn't reopen the tooltip or throw.
    setRect({ top: 999, height: 40, right: 200 });
    fireEvent.scroll(document);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
