# TrustMeBro — handoff guide (start here)

**Who this is for:** Anyone who needs the TrustMeBro website to **keep working** after the student team leaves — especially if you have **little or no experience** with coding or GitHub.

**What TrustMeBro is:** A website with charts about prediction markets and a chat assistant. It needs a place to “live” on the internet and a few paid or registered online services to work.

---

## The big idea (read this once)

Think of the website like a **store**:

| Piece | Plain-English meaning |
| ----- | -------------------- |
| **The website address (URL)** | What people type in the browser to open the site (like `https://…`). |
| **Hosting** | The computer (often a server at the college or a cloud company) that **runs** the site 24/7. |
| **Passwords for machines (API keys)** | Secret codes the site uses to talk to **data** and **AI** companies. They are not the same as your Lafayette password. |
| **GitHub** | A **filing cabinet on the internet** where the team stored the **recipe** (the code) for building the site. You do **not** need to learn GitHub unless you or IT will install updates from that recipe. |

**Why you are reading this:** Some of those pieces may be tied to a **student’s personal accounts**. When those accounts close, the site can **stop loading**, **lose data**, or **break the chat** unless someone moves hosting and keys to **college-owned or long-term accounts** first.

---

## Words you might see elsewhere (quick glossary)

- **Repository (“repo”)** — The project folder on GitHub that holds the code.
- **Deploy / deployment** — Putting a fresh copy of the site onto the server so the public can use it.
- **Server** — A computer that serves the website to visitors (often managed by **IT**).
- **Environment file** — A small private settings file on the server (the team calls it `.env.local`) where **API keys** are stored. It is **not** posted publicly on GitHub on purpose.

---

## You have three realistic paths

Pick the one that matches your comfort level. **All of them are OK.**

### Path A — “I will work with Lafayette IT (recommended if you are not technical)”

1. **Send IT this page** and say: *“We need to migrate TrustMeBro off student-owned accounts before they close.”*
2. **Ask IT to do the hands-on server steps** using the team’s detailed guide: **[HOW_TO_DEPLOY.md](./HOW_TO_DEPLOY.md)** (installing the app, restarting it, etc.).
3. **You (or the faculty sponsor)** still usually need to **open vendor accounts** with a **stable Lafayette email** and **approve any small costs** (for example AI usage), because IT cannot always do that for you. The deploy guide explains **which services** need keys: prediction market data, cache storage, and the AI chat.

**What to give IT in one email:** the link to this file, the link to `HOW_TO_DEPLOY.md`, and the link to **[CLIENT_TECHNICAL_DOCUMENTATION.md](./CLIENT_TECHNICAL_DOCUMENTATION.md)** for bigger-picture questions.

---

### Path B — “We will hire a student or contractor for a few hours”

Give them:

- This **HANDOFF.md** (context and risk),
- **[HOW_TO_DEPLOY.md](./HOW_TO_DEPLOY.md)** (step-by-step commands),
- **[CLIENT_TECHNICAL_DOCUMENTATION.md](./CLIENT_TECHNICAL_DOCUMENTATION.md)** (how the pieces fit together).

Ask them to **document the new URL** and **which email owns each service** when they are done.

---

### Path C — “I want to try the technical steps myself”

That is brave. Start only with **[HOW_TO_DEPLOY.md](./HOW_TO_DEPLOY.md)** after you read the checklist below. That guide includes links to official **Git** and **Node/npm** tutorials if the command line is new to you.

If anything feels unclear, **switch to Path A or B** — there is no shame in that; servers are easy to break if you are learning under time pressure.

---

## Simple checklist (what has to happen, in order)

Use this as a conversation guide with IT or a helper. You can literally check the boxes on paper.

- [ ] **Step 1 — Write down the current website address**  
  Open the site the way a normal user would. Copy the full address from the top of the browser. That is your **current URL**.

- [ ] **Step 2 — Ask the team (before they leave): “What closes when your accounts close?”**  
  You want a clear list: *hosting only*, *hosting + data keys*, *AI billing*, etc. If they are not sure, assume **everything tied to their personal email** must be redone.

- [ ] **Step 3 — Decide who will “own” the replacement accounts**  
  Best practice: **Lafayette email** and **college-approved purchasing**, not a personal credit card, for anything that must last.

- [ ] **Step 4 — Create new keys under the new owner**  
  When ownership changes, you should **create new keys** at each provider (do not share old keys forever). The deploy guide walks through **where to click** for each service.

- [ ] **Step 5 — Put the new keys on the server in the private settings file**  
  The technical guide calls this `.env.local`. Only people who maintain the server should see it.

- [ ] **Step 6 — Build and start the site on the server**  
  Your IT person or contractor follows **[HOW_TO_DEPLOY.md](./HOW_TO_DEPLOY.md)** for the exact commands.

- [ ] **Step 7 — Test like a regular user**  
  Open the site in a browser you do not usually use (or ask a colleague). Check: charts load, chat answers a simple question.

- [ ] **Step 8 — If the website address changed, update links**  
  Update bookmarks, syllabi, slides, or department pages so people are not sent to an old address.

---

## What is GitHub, and do I need it?

**GitHub** is where the **source code** lives: [https://github.com/jasmina-dev/trustmebro](https://github.com/jasmina-dev/trustmebro)

- **You do not need a GitHub account** just to **use** the website.
- You **might** need GitHub access **only if** you or IT will **download updates** from that page onto the server (the technical guide calls this **cloning** the repository).
- If the repository is **private**, GitHub will ask for a login. IT or whoever deploys may need a **GitHub account** and permission from the repo owner. That is normal.

---

## Information for the team (please fill in before handoff)

Copy this table into an email or print it. **Plain language answers** help the next person more than jargon.

| Question | Answer (fill in) |
| -------- | ----------------- |
| What is the **live website address** people use today? | |
| Where does the site **run** (Lafayette server, cloud name, or both)? | |
| **Whose email** owns hosting, if anyone? | |
| **Whose email** owns the prediction market data login? | |
| **Whose email** owns the cache (Redis) login? | |
| **Whose email** owns the AI (Anthropic) login and billing? | |
| **When** might student accounts be deactivated? | |
| Who should **Lafayette** call with one question (name + email)? | |

---

## If something is broken after migration

**Symptom: blank charts or errors on load**  
Usually missing or wrong **data** keys, or the data service is rate-limited. See the troubleshooting section in **[HOW_TO_DEPLOY.md](./HOW_TO_DEPLOY.md)** and the overview in **[CLIENT_TECHNICAL_DOCUMENTATION.md](./CLIENT_TECHNICAL_DOCUMENTATION.md)**.

**Symptom: chat does not answer**  
Usually **AI** keys, billing/credits, or rate limits. Same two documents.

**Symptom: “I am lost”**  
Go back to **Path A** and loop in IT with this page and **HOW_TO_DEPLOY.md**. Keeping the site running is a **normal IT + sponsor** task; it is not something you are expected to guess.

---

## Where the technical details live (for people who run the server)

| Document | What it is for |
| -------- | -------------- |
| **[HOW_TO_DEPLOY.md](./HOW_TO_DEPLOY.md)** | API keys, server setup, starting the app, updates, common errors. |
| **[CLIENT_TECHNICAL_DOCUMENTATION.md](./CLIENT_TECHNICAL_DOCUMENTATION.md)** | Bigger picture: architecture, services, how things connect. |

This **HANDOFF** file stays short on purpose: **context and order of operations** for non-experts. The other files stay the **instruction manual** for experts.
