# Personal Dashboard — Claude Code Handoff Spec

## What this is
A personal productivity dashboard, currently built as a single-file React
component (`planner_dashboard.jsx`) running inside a Claude.ai artifact.
It works, but it's capped by the artifact sandbox: no real database, no
scheduled jobs, no ability to call external APIs that need secret keys.
This spec describes what it would take to turn it into a real, standalone
app with genuine automation.

## Current features (already built, in the attached file)
1. **Week/Today planner** — Work + Study task columns per day, with:
   - Monday-start week view, toggle between full week and "today only"
   - Automatic rollover of unfinished tasks to the next day
   - Work tasks specifically skip weekends and roll to the following Monday
   - Escalating urgency tags the longer a task is carried over
   - Rotating daily motivational quote
2. **Quick Links bar** — user-editable shortcuts (Gmail, Outlook, NUS Canvas, etc.)
3. **Notes panel** — freeform sticky-note style notes
4. **Masters Deadline Tracker** — assignments with due dates, urgency color-coding
5. **Trip Scanner** — a destination watchlist with manually-logged price
   checks per destination, price history sparkline, $400 budget threshold
6. **Training Tracker** — manually logged workouts (Run/Gym/Other), weekly stats
7. **Dark mode** toggle

All data currently persists via `window.storage`, a Claude-artifact-only
API. **This will not exist outside Claude.ai and must be replaced.**

## What needs to become real automation

### 1. Trip Scanner → actual flight price scanning
Currently: user manually logs prices they find themselves.
Target: a scheduled job that checks flight prices automatically.

- **API options to evaluate**: Amadeus Self-Service API (has a free tier,
  good for cheap-flight search), Skyscanner's official partner API (harder
  to get access to as an individual), or Kiwi.com's Tequila API.
- **What's needed**: an API key from whichever provider, a server-side
  function that queries SIN → each watchlist destination for Oct–Dec dates,
  5+ day trip lengths, and logs results into the database automatically.
- **Scheduling**: a daily cron job (e.g. `node-cron` if using Node, or a
  simple scheduled task if deployed on a platform with built-in cron
  support like Render or Railway).
- Keep the manual "log a price" form too — useful as a fallback and for
  fares the API might miss (e.g. budget carrier combos).

### 2. Training Tracker → Garmin sync
Currently: manually logged.
Target: pull activity data automatically from Garmin.

- **API**: Garmin Connect doesn't have an open public API for individual
  developers in the way Strava does — the realistic paths are:
  - **Garmin Connect IQ / Health API** (requires a developer agreement,
    more involved approval process), or
  - **Sync via Strava instead**: if Garmin activities already auto-upload
    to Strava (common setup), use the Strava API, which is much easier to
    get personal API access to. This sidesteps Garmin's API entirely.
- **What's needed**: OAuth app registration (Strava or Garmin), a token
  refresh flow, and a scheduled job that pulls new activities and inserts
  them into the training log table.
- Note: this is the same integration that hit CORS/mixed-content issues
  in an earlier project (ForgeFit) — those issues were specifically about
  calling the API directly from browser JS. A real backend sidesteps that
  because the request happens server-side, not in the browser.

### 3. Storage → real database
Replace every `window.storage.get/set` call with real persistence.
- Simplest: SQLite via a library like `better-sqlite3` (Node) — good for
  a single-user personal app, no separate database server needed.
- Data model is already implied by the existing state shapes: tasks (keyed
  by day + category), training entries, trip destinations + price logs,
  quick links, notes, deadlines. These map cleanly to tables.

### 4. Hosting
For a personal single-user tool, running it locally (or on a small always-on
machine / Raspberry Pi / free-tier host like Railway or Fly.io) is enough —
no need for anything elaborate. The scheduled jobs (flight scan, Garmin sync)
need *something* to be running continuously, so plan for that regardless of
where the frontend itself is viewed from.

## Suggested first steps for Claude Code
1. Scaffold a basic Node/Express (or similar) backend + SQLite database
   matching the existing data shapes.
2. Port `planner_dashboard.jsx` to call real API endpoints instead of
   `window.storage`.
3. Get one integration working end-to-end first — Strava is likely the
   easier win (better API docs, easier personal access) — before tackling
   a flights API.
4. Add the scheduled jobs last, once manual endpoints work correctly.

## Files included
- `planner_dashboard.jsx` — the current, fully-working frontend component
