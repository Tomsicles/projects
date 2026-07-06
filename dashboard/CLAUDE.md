# CLAUDE.md — dashboard/

Guidance 4 Claude Code when working in this subfolder.

## What this is

Personal productivity dashboard. Full spec → `PROJECT_SPEC.md` (read b4 any
work here). Current state: single React file `planner_dashboard.jsx`, ran
as Claude.ai artifact. Persists via `window.storage` — artifact-only API,
!! must be replaced, won't exist standalone.

## Features already built (in planner_dashboard.jsx)

Week/today planner (Work+Study tasks, rollover, urgency tags) · Quick
Links bar · Notes panel · Masters Deadline Tracker · Trip Scanner
(manual price log, $400 threshold) · Training Tracker (manual logs) ·
Dark mode.

## Target architecture (not yet built)

- Backend: Node/Express (or similar) + SQLite (`better-sqlite3`) — single
  user, no separate db server needed.
- Trip Scanner → real automation via flight API (Amadeus Self-Service
  favored, free tier) + daily cron job, SIN → watchlist dests.
- Training Tracker → Strava API sync (favored over Garmin's API — much
  easier personal access; if Garmin activities auto-upload to Strava,
  sidesteps Garmin dev agreement entirely). Server-side call avoids
  CORS/mixed-content issues hit b4 in ForgeFit project (browser-side
  Garmin calls).
- Hosting: personal single-user tool → local machine / Pi / free tier
  (Railway, Fly.io) enough. Scheduled jobs need something always-on
  regardless of where frontend viewed from.

## Build order (per spec)

1. Scaffold backend + SQLite matching existing state shapes (tasks,
   training entries, trip dests+price logs, quick links, notes,
   deadlines).
2. Port `planner_dashboard.jsx` → real API calls, replace `window.storage`.
3. Strava integration first (easier win), flights API after.
4. Scheduled jobs (flight scan, Strava sync) last, after manual endpoints
   work.

## Workflow

Follow root CLAUDE.md: brainstorm → design spec → implementation plan
b4 code. Both design specs and implementation plans live together in
`dashboard/plan/` (one folder, `YYYY-MM-DD-<topic>-*.md`) — unlike
`quant/`, this project does not split specs into a separate `docs/`
tree.

## Run

Node 20+. `npm run install-all` once, then `npm run dev` from `dashboard/`
— runs backend (:3001) + frontend (:5173) together via `concurrently`.
DB file: `backend/data/dashboard.db` (gitignored, created + seeded on
first boot).
