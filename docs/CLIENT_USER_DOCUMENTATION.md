# CLIENT_USER_DOCUMENTATION

**TrustMeBro Analytics — User guide (non-technical)**

---

## What this site is for

TrustMeBro is a **research-style dashboard** for prediction markets. It brings together live odds, trading activity, and patterns that can differ between major venues (for example Polymarket and Kalshi). An **AI assistant** can answer questions in everyday language about what you are looking at on screen.

**Important:** The product is labeled for **research and educational use only**. It is **not** investment or trading advice, and it does not tell you what to buy or sell.

---

## How to get started

1. **Open the site** — You land on a short welcome page with the product name and a short description.
2. **Open the dashboard** — Use **Open dashboard** to enter the main workspace.
3. **Work top to bottom** — The dashboard is designed like a single scrolling report. The **Overview** at the top gives the big picture; sections below go deeper.

If you want to **reset filters** to defaults, go back to the home page and reopen the dashboard with default settings (the first-time user guide card includes a link to `/`).

---

## Moving around the dashboard

- **Left sidebar (computer / tablet width):** **Jump to** lists each major section (Overview, resolution bias, cross-venue spreads, momentum, calibration, timeline, liquidity, price vs resolution, leaderboard, first-time guide). Click a section to scroll there. You can **collapse** the sidebar to icons only for more chart space.
- **Phone:** Use the **menu (hamburger)** at the top to open the same section list, then tap a section.

---

## Controls at the top

- **Source** — **All**, **Polymarket**, or **Kalshi** narrows which venue’s data drives many views. **All** is a good starting point.
- **Category** — **All**, **Politics**, **Crypto**, **Finance**, or **Other** focuses the dashboard on a topic.
- **Date range** — On **wide screens**, you can set a **start** and **end** date for time-based views. On smaller screens this may be tucked away; use a larger window if you need date controls.
- **Ask AI** — Opens the **AI Analyst** side panel (see below). **Close chat** hides it again.
- **Light / dark** — A theme control next to the chat button lets you pick a comfortable reading mode.
- **Data credit** — A link to **pmxt.dev** appears on larger layouts; that is the upstream data provider.

---

## Overview — the four summary cards

At the top of the dashboard, four cards summarize the current slice of the market (they respect your **Source** and **Category** filters where applicable):

| Card                       | In plain terms                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Markets analyzed**       | How many markets are in the current filtered set.                                                                                                                        |
| **Avg politics NO-rate**   | For **Politics** markets that already resolved, what share paid out on **NO** (not a live price). Hints like “biased toward NO” are interpretive labels on the card.     |
| **Top spread today**       | The largest **difference in implied “yes” odds** between Polymarket and Kalshi among highlighted cross-venue cases (sports-style signals are excluded from this logic).  |
| **Inefficiencies flagged** | How many standout “signal” rows the system is currently surfacing. The card notes that this block **refreshes about every five minutes** — numbers are not tick-by-tick. |

Many cards and charts have a **?** (help) control — use it anytime you want a **short, plain-language explanation** of that metric or chart.

---

## What each main section is for (non-technical)

1. **Resolution bias** — Heatmap and related view of how often markets in different **categories** and **venues** resolved one way vs another historically. Useful for asking whether a corner of the market tends to resolve against one side.
2. **Cross-venue divergence** — Where the **same idea** can trade on both venues but the **prices disagree** enough to stand out. Useful for checking whether two places are saying the same thing.
3. **Market momentum** — **Recent movers**: which way odds moved over the last day, so you can see what is heating up or cooling down.
4. **Calibration curve** — Compares **where prices ended** before resolution to **what actually happened**. A high-level picture of whether odds were well calibrated.
5. **Efficiency timeline** — How **mispricing** (by the app’s internal measures) has looked **over time** (by month), so you can see whether markets look more or less “efficient” in different periods.
6. **Liquidity gap** — Highlights places where **a lot is trading** relative to **how easy it is to trade size** (volume vs depth). Useful for spotting “busy but thin” situations.
7. **Price vs resolution** — A focused view for **late moves**: where the **final price** before settlement and the **actual outcome** were far apart.
8. **Leaderboard** — A **sortable table** of standout scores so you can scan what looks most unusual under your current filters.
9. **First-time user guide** — A short **on-dashboard checklist** (filters, KPIs, **?** help, leaderboard, AI) for new users.

Charts may show a **loading placeholder** first, then fill in. If something fails, the app uses **friendly error areas** with a chance to **retry** rather than a blank crash.

---

## AI Analyst (“Ask AI”)

- **What it knows:** When you send a message, the assistant receives a snapshot of your **current filters**, **visible markets**, **scores on screen**, and related summary stats — so answers should stay tied to **what you are actually viewing**.
- **Suggested questions:** When the chat is empty, you can tap **starter questions** (for example about spreads, inefficiencies, or explaining a chart).
- **Export** — Downloads the conversation as a **text file** for your notes or sharing internally.
- **Clear** — Starts a **new** conversation (does not change your filters or charts).

Treat AI replies as **draft explanations** to double-check against the charts and your own judgment — especially for anything that could affect money or compliance.

---

## Phones and tablets

The layout **stacks** on narrow screens: one column, sidebar as a drawer, and some controls (like full date pickers) may only appear on **wider** layouts. If something feels cramped, rotating to landscape or using a larger window restores the full control strip.

---

## One-line summary for your team

Pick **source** and **category** at the top, read the four **summary cards**, use the **left menu** or scroll through each story (bias, cross-venue gaps, momentum, calibration, timeline, liquidity, late surprises, leaderboard), tap **?** when confused, and use **Ask AI** for plain-language follow-up — remembering this is **research-only**, not advice.

---

## Related documentation

- [`CLIENT_TECHNICAL_DOCUMENTATION.md`](./CLIENT_TECHNICAL_DOCUMENTATION.md) — architecture, APIs, state, and operations for technical stakeholders.
