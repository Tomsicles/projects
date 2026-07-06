# Strava Integration Design

Status: approved
Date: 2026-07-07

## Context

Second sub-project for the dashboard rebuild (after the backend + SQLite +
frontend port). Per `dashboard/CLAUDE.md`'s build order, Strava integration
comes before the flights API, and is favored over Garmin's API for ease of
personal access. The Training Tracker already exists (manual logging into
`training_entries`); this adds Strava as a second, automatic source feeding
the same table.

## Goals

- One-time OAuth connect to Strava (personal account, single user).
- Pull recent activities into the existing `training_entries` table so the
  Training Tracker UI needs no changes to *display* synced data.
- Sync happens automatically whenever the dashboard is opened (fire on
  frontend mount), with a manual "Sync Strava" button as a fallback in case
  the automatic fire-on-load doesn't work.
- No duplicate entries on repeated syncs.

## Non-goals (for this spec)

- Scheduled/cron-based sync (e.g. OS task scheduler, always-on server) —
  explicitly deferred; build order documents scheduled jobs as a later
  sub-project once manual/on-demand endpoints work.
- Garmin API integration — Strava was chosen specifically to avoid it.
- Editing or annotating synced entries beyond what manual entries already
  support (delete works the same for both; no entry type has an edit UI
  today).
- Hosting changes. This still runs on whatever machine the dev server runs
  on; if the backend isn't running when the dashboard is opened, sync
  simply doesn't happen that time — acceptable for now per user decision.

## Architecture

Two additions to the existing Express + SQLite backend, no new services:

- **OAuth routes** (`backend/src/routes/strava.js`) — one-time connect flow,
  stores tokens server-side. Never exposed to the frontend.
- **Sync endpoint** (`POST /api/strava/sync`) — idempotent; safe to call
  repeatedly. Triggered two ways: automatically by the frontend on mount,
  and manually via a "Sync Strava" button. Both call the exact same
  endpoint — there is no separate code path for "manual" vs "auto".

## Components

```
backend/
  src/
    routes/
      strava.js        # /connect, /callback, /sync
    stravaClient.js     # token refresh + Strava API fetch helpers
  .env                  # STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET (gitignored)
frontend/
  src/
    api.js              # + getStravaStatus, connectStrava, syncStrava
    PlannerDashboard.jsx # Training Tracker header: connect/sync UI + on-mount sync
```

## Data model changes

```sql
-- single-row table; personal single-user app, no multi-account support
CREATE TABLE IF NOT EXISTS strava_tokens (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,   -- unix seconds
  last_synced_at INTEGER            -- ms epoch; NULL until first sync
);

ALTER TABLE training_entries ADD COLUMN strava_activity_id TEXT;
-- NULL for manual entries; unique Strava activity id for synced ones (dedup key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_training_strava_id
  ON training_entries(strava_activity_id) WHERE strava_activity_id IS NOT NULL;
```

## OAuth flow

1. `GET /api/strava/connect` → redirects to Strava's authorize URL
   (`scope=activity:read_all`), using `STRAVA_CLIENT_ID` from `.env`.
2. Strava redirects back to `GET /api/strava/callback?code=...`.
3. Backend exchanges `code` for `{access_token, refresh_token, expires_at}`
   via Strava's token endpoint (using `STRAVA_CLIENT_SECRET`), upserts the
   single row in `strava_tokens`, redirects back to the dashboard frontend.
4. `GET /api/strava/status` → `{ connected: boolean, lastSyncedAt: number|null }`
   — frontend uses this to decide whether to show "Connect Strava" or the
   sync button + last-synced label.

## Sync flow (`POST /api/strava/sync`)

1. Load `strava_tokens`. If none, return 400 `{error: "not connected"}`.
2. If `expires_at` is past (or near-expiry), refresh via Strava's token
   refresh endpoint, update the stored tokens.
3. Fetch activities via Strava's `GET /athlete/activities` with
   `after = last_synced_at` (or account creation time if never synced),
   paginating until exhausted.
4. For each activity not already present (checked via
   `strava_activity_id` unique index — insert with `INSERT OR IGNORE`,
   cheaper than a pre-check query per activity):
   - Map Strava `type` → local enum: `Run` → `run`; `WeightTraining` /
     `Workout` → `gym`; everything else → `other`.
   - `duration` = `moving_time` (seconds) / 60, rounded to nearest minute.
   - `distance` = `distance` (meters) / 1000 (km), or `null` if the
     activity type has no distance (e.g. weight training).
   - `notes` = Strava activity `name`.
   - `date` = activity `start_date_local`, truncated to `YYYY-MM-DD`.
5. Update `last_synced_at` to now (ms epoch) only after a successful fetch
   (not per-activity) — a failed fetch leaves it unchanged so the next
   sync retries the same window.
6. Response: `{ synced: number, lastSyncedAt: number }` on success, or
   `{ error }` with appropriate status on failure (backend logs the
   underlying cause server-side either way).

## Frontend changes

Training Tracker header gains a small status area:
- Not connected → "Connect Strava" button → `GET /api/strava/connect`
  (full browser navigation, not fetch, since it's a redirect flow).
- Connected → "Sync Strava" button + "Last synced: <relative time>" label
  (or "Never" if `lastSyncedAt` is null).
- On `PlannerDashboard` mount, if connected, fire `POST /api/strava/sync`
  in the background (fire-and-forget, same call the button makes) and
  update the last-synced label when it resolves. No loading blocker on
  the rest of the dashboard.
- Manual button click: same call, but shows a brief "Syncing..." state on
  the button itself and surfaces failure via the existing `trainingError`
  string pattern (`"Couldn't save — your changes may not persist."` is
  wrong copy for this case — use a separate message, e.g. "Strava sync
  failed — try again."). Auto-fire-on-mount failures are silent (console
  log only), matching "no user-facing error for unattended triggers."
- Synced entries render in the training list exactly like manual ones
  (same table, same fields); no visual distinction planned for MVP.

## Error handling

- No `strava_tokens` row → sync endpoint returns 400; frontend just shows
  the "Connect Strava" state, never calls sync.
- Refresh token rejected (revoked access) → sync endpoint returns 401;
  frontend treats this the same as "not connected" and shows "Connect
  Strava" again on next load (re-checks `/api/strava/status`).
- Strava API down/rate-limited → sync endpoint returns 502/429 as
  appropriate; manual-button path shows the error string, auto-mount path
  logs and stays silent.
- Partial page of activities fails mid-pagination → don't update
  `last_synced_at`; already-inserted activities in that batch are safe to
  re-fetch next time (`INSERT OR IGNORE` on the unique index is a no-op
  for duplicates).

## Testing

- Manual/curl verification (matches the pattern used for the first
  sub-project, no automated test suite exists in this project yet):
  - Fresh connect: hit `/api/strava/connect`, complete the browser OAuth
    flow, confirm `strava_tokens` has a row and `/api/strava/status`
    reports `connected: true`.
  - First sync: call `/api/strava/sync`, confirm new rows appear in
    `training_entries` with correct type/duration/distance mapping and a
    non-null `strava_activity_id`; confirm `last_synced_at` updated.
  - Re-sync with no new Strava activities: confirm `synced: 0`, no
    duplicate rows.
  - Simulate expired access token (manually set `expires_at` to the past
    in the db) → confirm sync still succeeds via refresh.
  - Simulate revoked token (corrupt `refresh_token`) → confirm sync
    returns 401 and frontend falls back to "Connect Strava".
  - Load dashboard while connected → confirm sync fires automatically
    and the last-synced label updates without a manual click.
  - Click "Sync Strava" manually → confirm it works standalone (this is
    the explicit fallback path the user asked for in case auto-fire
    doesn't trigger).

## Dependencies / open items

- Requires a Strava API application already registered (user confirmed
  they have one); `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` go into a
  new gitignored `backend/.env`, loaded via Node 20's built-in
  `--env-file=.env` (no new dependency).
- `backend/package.json` scripts (`dev`, `start`) need `--env-file=.env`
  added.
