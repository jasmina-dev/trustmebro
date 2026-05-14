"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader } from "./ui/Card";

/**
 * First-time user guide card shown on the dashboard.
 *
 * @remarks
 * Provides lightweight onboarding and links to the key chart sections without
 * requiring any data fetches.
 */
export function FirstTimeUserGuide() {
  return (
    <Card>
      <CardHeader
        title="First-time user guide"
        subtitle="A quick walkthrough to help you feel at home."
      />
      <CardBody className="space-y-3 text-sm text-fg-muted">
        <p>
          Welcome! If this is your first visit, the easiest way to get started
          is to move through the dashboard from top to bottom. You do not need
          to know the technical details to get useful insights.
        </p>
        <p>
          Begin in <span className="font-semibold text-fg">Overview</span> to
          see the big picture, then use the left sidebar to open each section
          one at a time.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Choose your filters at the top (source, category, and date range).
          </li>
          <li>
            Check the KPI cards first for a quick summary of what is happening.
          </li>
          <li>
            Open each chart and click the{" "}
            <span className="font-semibold text-fg">?</span> icon whenever you
            want a plain-language explanation.
          </li>
          <li>
            Visit <span className="font-semibold text-fg">Leaderboard</span> to
            see which opportunities stand out the most right now.
          </li>
          <li>
            Use <span className="font-semibold text-fg">Ask AI</span> for a
            simple summary or to compare markets in your current view.
          </li>
        </ol>
        <p>
          Tip: start broad, then narrow down. A good flow is: all sources - pick
          one category - inspect top signals - ask AI follow-up questions.
        </p>
        <p className="text-xs">
          Want to start over? Return to the landing page at{" "}
          <Link href="/" className="underline hover:text-fg">
            /
          </Link>{" "}
          and reopen the dashboard with default settings.
        </p>
      </CardBody>
    </Card>
  );
}
