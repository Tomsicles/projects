# Strava Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the dashboard to Strava so training sessions logged there sync automatically into the existing Training Tracker, with a manual "Sync Strava" button as a fallback.

**Architecture:** Two new backend pieces (an OAuth+sync route module, a Strava HTTP client helper) bolt onto the existing Express + better-sqlite3 backend; the frontend gets a small status/sync widget in the Training Tracker header plus an on-mount background sync call. No new services, no cron — matches `dashboard/plan/2026-07-07-strava-integration-design.md`.

**Tech Stack:** Node 20 (built-in `fetch`, `--env-file`), Express, better-sqlite3, React (existing `PlannerDashboard.jsx`).

## Global Constraints

- No automated test framework exists in this project (confirmed during the prior backend sub-project) — verification is curl + manual browser checks, matching the established pattern. Do not introduce a test runner as part of this plan.
- API JSON stays camelCase exactly as elsewhere in this codebase; route handlers map to/from snake_case columns (see `routes/trips.js`, `routes/training.js` for the existing convention).
- `strava_activity_id` is the dedup key: `INSERT OR IGNORE` against a partial unique index, not a pre-check query (per spec §Sync flow step 4).
- Training entry `type` must stay within the existing CHECK constraint `('run','gym','other')` — do not add new enum values.
- `last_synced_at` only advances on a fully successful fetch (not per-activity), so a failed sync retries the same window next time (spec §Sync flow step 5, §Error handling).
- Secrets (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`) live only in a gitignored `backend/.env`, loaded via Node's `--env-file` flag — no `dotenv` dependency (spec §Dependencies).

## Prerequisites (human, before Task 3 can be smoke-tested)

1. You already have a Strava API application. Confirm its **Authorization Callback Domain** (in Strava's API settings) is set to `localhost` — Strava only stores a bare domain there, and the callback URL this plan implements is `http://localhost:3001/api/strava/callback`.
2. After Task 3 is implemented, create `dashboard/backend/.env` (gitignored, not created by any task below) with:
   ```
   STRAVA_CLIENT_ID=<your client id>
   STRAVA_CLIENT_SECRET=<your client secret>
   ```
3. The actual OAuth consent screen (clicking "Authorize" on Strava's page) requires your real Strava login — no agent can complete that step. After Task 3's routes are in place and `.env` exists, you'll need to visit `http://localhost:3001/api/strava/connect` yourself once in a browser to finish connecting. Task 3's verification step covers everything that *can* be checked without that click; full end-to-end (Task 4) needs you to have done it.

---

### Task 1: Schema migration — `strava_tokens` table + `training_entries.strava_activity_id`

**Files:**
- Modify: `dashboard/backend/src/db.js`

**Interfaces:**
- Produces: `strava_tokens` table (columns: `id` fixed at 1, `access_token`, `refresh_token`, `expires_at` (unix seconds), `connected_at` (ms epoch), `last_synced_at` (ms epoch, nullable)); `training_entries.strava_activity_id` (nullable TEXT) with a partial unique index `idx_training_strava_id`.

- [x] **Step 1: Add the `strava_tokens` table to the schema block**

In `db.js`, inside the existing `db.exec(\`...\`)` template literal (after the `training_entries` table, before `settings`), add:

```sql
CREATE TABLE IF NOT EXISTS strava_tokens (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  expires_at     INTEGER NOT NULL,
  connected_at   INTEGER NOT NULL,
  last_synced_at INTEGER
);
```

`id` is pinned to `1` (single-row table, single-user app — same pattern as `settings` being a key/value table, just simpler since there's only ever one Strava connection).

- [x] **Step 2: Add the idempotent column migration for `training_entries`**

After the `seedIfEmpty();` call at the bottom of `db.js`, add:

```javascript
// Idempotent migration: strava_activity_id was added after training_entries
// already existed in deployed dbs, so ALTER TABLE can't go in the CREATE TABLE
// IF NOT EXISTS block above.
const trainingCols = db.prepare("PRAGMA table_info(training_entries)").all();
if (!trainingCols.some((c) => c.name === "strava_activity_id")) {
  db.exec("ALTER TABLE training_entries ADD COLUMN strava_activity_id TEXT");
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_training_strava_id
    ON training_entries(strava_activity_id)
    WHERE strava_activity_id IS NOT NULL;
`);
```

The partial index (`WHERE strava_activity_id IS NOT NULL`) means manual entries — which all have `strava_activity_id = NULL` — never collide with each other; only two rows both carrying the *same* real Strava activity id would conflict, which is exactly the dedup behavior Task 3 relies on.

- [x] **Step 3: Verify the migration**

Delete the dev db so it rebuilds from scratch, then start the backend and inspect the schema:

```bash
cd dashboard/backend
rm -f data/dashboard.db data/dashboard.db-shm data/dashboard.db-wal
node src/server.js &
sleep 1
node -e "
const Database = require('better-sqlite3');
const db = new Database('data/dashboard.db');
console.log(db.prepare('PRAGMA table_info(strava_tokens)').all());
console.log(db.prepare('PRAGMA table_info(training_entries)').all().find(c => c.name === 'strava_activity_id'));
console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE name = 'idx_training_strava_id'\").get());
"
```

Expected: `strava_tokens` columns print with `id, access_token, refresh_token, expires_at, connected_at, last_synced_at`; the `strava_activity_id` column object prints (not `undefined`); the index name prints. Stop the background server afterward (`kill %1` or find the PID on port 3001).

- [x] **Step 4: Commit**

```bash
git add dashboard/backend/src/db.js
git commit -m "feat(dashboard): add strava_tokens table and training_entries dedup column"
```

---

### Task 2: Strava HTTP client helper

**Files:**
- Create: `dashboard/backend/src/stravaClient.js`

**Interfaces:**
- Consumes: `process.env.STRAVA_CLIENT_ID`, `process.env.STRAVA_CLIENT_SECRET` (set in Task 3's `.env`).
- Produces: `buildAuthorizeUrl(redirectUri: string): string`; `exchangeCodeForToken(code: string): Promise<{accessToken, refreshToken, expiresAt}>`; `refreshAccessToken(refreshToken: string): Promise<{accessToken, refreshToken, expiresAt}>`; `fetchActivitiesSince(accessToken: string, afterEpochSeconds: number): Promise<Array<StravaActivity>>` where each `StravaActivity` has at least `{id, type, start_date_local, moving_time, distance, name}` (Strava API's native shape — this module does no field renaming, that's Task 3's job).

- [x] **Step 1: Write the module**

```javascript
// dashboard/backend/src/stravaClient.js
const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

export function buildAuthorizeUrl(redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "activity:read_all",
    approval_prompt: "auto",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function postToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      ...body,
    }),
  });
  if (!res.ok) {
    const err = new Error(`Strava token endpoint failed: ${res.status} ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_at,
  };
}

export function exchangeCodeForToken(code) {
  return postToken({ code, grant_type: "authorization_code" });
}

export function refreshAccessToken(refreshToken) {
  return postToken({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

export async function fetchActivitiesSince(accessToken, afterEpochSeconds) {
  const perPage = 100;
  const activities = [];
  let page = 1;
  while (true) {
    const url = new URL(ACTIVITIES_URL);
    url.searchParams.set("after", String(afterEpochSeconds));
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = new Error(`Strava activities endpoint failed: ${res.status} ${await res.text()}`);
      err.status = res.status;
      throw err;
    }
    const batch = await res.json();
    activities.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return activities;
}
```

- [x] **Step 2: Verify without hitting the network**

`buildAuthorizeUrl` is pure and safe to check standalone; it's the only function that doesn't require live credentials or network access:

```bash
cd dashboard/backend
STRAVA_CLIENT_ID=test123 node -e "
import('./src/stravaClient.js').then(m => {
  const url = m.buildAuthorizeUrl('http://localhost:3001/api/strava/callback');
  console.log(url);
  if (!url.includes('client_id=test123')) throw new Error('client_id missing from URL');
  if (!url.includes('scope=activity%3Aread_all')) throw new Error('scope missing from URL');
  console.log('OK');
});
"
```

Expected: prints the built URL, then `OK`. (`exchangeCodeForToken`, `refreshAccessToken`, and `fetchActivitiesSince` all call the real Strava API and can only be verified end-to-end in Task 3/4 once real credentials and a connected account exist.)

- [x] **Step 3: Commit**

```bash
git add dashboard/backend/src/stravaClient.js
git commit -m "feat(dashboard): add Strava OAuth + activities HTTP client helper"
```

---

### Task 3: OAuth + sync routes, server mounting, env setup

**Files:**
- Create: `dashboard/backend/src/routes/strava.js`
- Create: `dashboard/backend/.env.example`
- Modify: `dashboard/backend/.gitignore`
- Modify: `dashboard/backend/package.json`
- Modify: `dashboard/backend/src/server.js`

**Interfaces:**
- Consumes: `db` from `../db.js` (Task 1's `strava_tokens` table and `training_entries.strava_activity_id`); `buildAuthorizeUrl`, `exchangeCodeForToken`, `refreshAccessToken`, `fetchActivitiesSince` from `../stravaClient.js` (Task 2).
- Produces: `GET /api/strava/connect`, `GET /api/strava/callback`, `GET /api/strava/status` → `{connected: boolean, lastSyncedAt: number|null}`, `POST /api/strava/sync` → `{synced: number, lastSyncedAt: number}` or `{error: string}`.

- [x] **Step 1: Write the route module**

```javascript
// dashboard/backend/src/routes/strava.js
import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  fetchActivitiesSince,
} from "../stravaClient.js";

const router = Router();

const getTokens = db.prepare("SELECT * FROM strava_tokens WHERE id = 1");
const upsertTokens = db.prepare(`
  INSERT INTO strava_tokens (id, access_token, refresh_token, expires_at, connected_at, last_synced_at)
  VALUES (1, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at
`);
const updateLastSynced = db.prepare("UPDATE strava_tokens SET last_synced_at = ? WHERE id = 1");
const deleteTokens = db.prepare("DELETE FROM strava_tokens WHERE id = 1");

const insertTrainingEntry = db.prepare(`
  INSERT OR IGNORE INTO training_entries
    (id, date, type, duration, distance, notes, created_at, strava_activity_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function redirectUri(req) {
  return `${req.protocol}://${req.get("host")}/api/strava/callback`;
}

function mapActivityType(stravaType) {
  if (stravaType === "Run") return "run";
  if (stravaType === "WeightTraining" || stravaType === "Workout") return "gym";
  return "other";
}

router.get("/connect", (req, res) => {
  res.redirect(buildAuthorizeUrl(redirectUri(req)));
});

router.get("/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "missing code" });
  try {
    const { accessToken, refreshToken, expiresAt } = await exchangeCodeForToken(code);
    const existing = getTokens.get();
    upsertTokens.run(
      accessToken,
      refreshToken,
      expiresAt,
      existing?.connected_at ?? Date.now(),
      existing?.last_synced_at ?? null
    );
    res.redirect("http://localhost:5173/");
  } catch (e) {
    console.error("Strava callback failed:", e);
    res.status(502).json({ error: "strava token exchange failed" });
  }
});

router.get("/status", (req, res) => {
  const row = getTokens.get();
  res.json({ connected: !!row, lastSyncedAt: row?.last_synced_at ?? null });
});

router.post("/sync", async (req, res) => {
  let row = getTokens.get();
  if (!row) return res.status(400).json({ error: "not connected" });

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (row.expires_at <= nowSeconds + 60) {
    try {
      const refreshed = await refreshAccessToken(row.refresh_token);
      upsertTokens.run(
        refreshed.accessToken,
        refreshed.refreshToken,
        refreshed.expiresAt,
        row.connected_at,
        row.last_synced_at
      );
      row = getTokens.get();
    } catch (e) {
      console.error("Strava token refresh failed:", e);
      // Refresh token rejected (revoked access) — delete the row so
      // /status flips to connected:false and the frontend shows
      // "Connect Strava" again on next load, per spec §Error handling.
      deleteTokens.run();
      return res.status(401).json({ error: "strava token refresh failed" });
    }
  }

  // First sync ever: bound the backfill to 30 days instead of pulling full
  // Strava history (spec's "account creation time" cursor was ambiguous —
  // this is the resolved, bounded interpretation; see Self-Review Notes).
  const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
  const afterEpoch = row.last_synced_at
    ? Math.floor(row.last_synced_at / 1000)
    : Math.floor(row.connected_at / 1000) - THIRTY_DAYS_SECONDS;

  let activities;
  try {
    activities = await fetchActivitiesSince(row.access_token, afterEpoch);
  } catch (e) {
    console.error("Strava activities fetch failed:", e);
    return res.status(e.status === 429 ? 429 : 502).json({ error: "strava activities fetch failed" });
  }

  let synced = 0;
  try {
    const insertAll = db.transaction((items) => {
      for (const a of items) {
        const result = insertTrainingEntry.run(
          crypto.randomUUID(),
          String(a.start_date_local).slice(0, 10),
          mapActivityType(a.type),
          Math.round(a.moving_time / 60),
          a.distance ? a.distance / 1000 : null,
          a.name || "",
          Date.now(),
          String(a.id)
        );
        if (result.changes > 0) synced += 1;
      }
    });
    insertAll(activities);
  } catch (e) {
    console.error("Strava activity insert failed:", e);
    return res.status(500).json({ error: "failed to store synced activities" });
  }

  const now = Date.now();
  updateLastSynced.run(now);
  res.json({ synced, lastSyncedAt: now });
});

export default router;
```

- [x] **Step 2: Create the env template and update `.gitignore`**

```bash
# dashboard/backend/.env.example
cat > dashboard/backend/.env.example <<'EOF'
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
EOF
```

In `dashboard/backend/.gitignore`, add `.env` (keep the existing `data/` and `node_modules/` lines):

```
data/
node_modules/
.env
```

- [x] **Step 3: Load env vars in the dev/start scripts**

In `dashboard/backend/package.json`, change the `scripts` block to:

```json
"scripts": {
  "dev": "node --env-file-if-exists=.env --watch src/server.js",
  "start": "node --env-file-if-exists=.env src/server.js"
}
```

Use `--env-file-if-exists` (Node 20.12+/22+), not `--env-file` — the latter throws `ENOENT` and crashes the server at boot if `.env` doesn't exist yet, which would break `npm run dev` for anyone who hasn't done the Prerequisites step. `--env-file-if-exists` loads it if present and is a no-op otherwise, so the rest of the dashboard keeps working before Strava is ever connected.

- [x] **Step 4: Mount the router in `server.js`**

Add the import alongside the other route imports:

```javascript
import stravaRouter from "./routes/strava.js";
```

Add the mount alongside the other `app.use("/api/...")` lines (after `settingsRouter`):

```javascript
app.use("/api/strava", stravaRouter);
```

- [x] **Step 5: Verify what's checkable without the manual OAuth click**

You (the human) must have already created `dashboard/backend/.env` with real credentials per this plan's Prerequisites section — confirm it exists first: `ls dashboard/backend/.env`. (`--env-file-if-exists` means the server still boots without it, but `/connect` would redirect with an empty `client_id` and fail at Strava's end.)

```bash
cd dashboard/backend
node --env-file=.env src/server.js &
sleep 1
curl -s http://localhost:3001/api/strava/status
echo
curl -s -X POST http://localhost:3001/api/strava/sync
echo
curl -s -i http://localhost:3001/api/strava/connect | head -5
```

Expected:
- `/status` → `{"connected":false,"lastSyncedAt":null}` (no tokens row yet)
- `/sync` → `{"error":"not connected"}` with a 400 (check via `-w` if you want the status code explicitly)
- `/connect` → an HTTP redirect (`HTTP/1.1 302 Found` and a `Location:` header pointing at `https://www.strava.com/oauth/authorize?...` containing your real `client_id`)

Stop the background server afterward. Then, per the Prerequisites: visit `http://localhost:3001/api/strava/connect` yourself in a real browser, log into Strava, and click Authorize. Confirm you land back on `http://localhost:5173/` and that:

```bash
curl -s http://localhost:3001/api/strava/status
```

now returns `{"connected":true,"lastSyncedAt":null}`. This human step is required before Task 4's frontend wiring can be exercised end-to-end.

- [x] **Step 6: Commit**

```bash
git add dashboard/backend/src/routes/strava.js dashboard/backend/.env.example \
        dashboard/backend/.gitignore dashboard/backend/package.json dashboard/backend/src/server.js
git commit -m "feat(dashboard): add Strava OAuth connect/callback/status/sync routes"
```

(`.env` itself is gitignored and never staged.)

---

### Task 4: Frontend — status widget, on-mount sync, manual sync button

**Files:**
- Modify: `dashboard/frontend/src/api.js`
- Modify: `dashboard/frontend/src/PlannerDashboard.jsx`

**Interfaces:**
- Consumes: `GET /api/strava/status`, `POST /api/strava/sync`, `GET /api/training` (existing, for re-fetching after a sync), all from Task 3.
- Produces: `api.getStravaStatus()`, `api.syncStrava()`, `api.getTrainingEntries()` (existing) wired into new component state: `stravaConnected`, `stravaLastSyncedAt`, `stravaSyncing`, `stravaSyncError`.

- [x] **Step 1: Add API functions**

In `dashboard/frontend/src/api.js`, after the `--- settings ---` section at the bottom, add:

```javascript
// --- strava ---
export const getStravaStatus = () => get("/strava/status");
export const syncStrava = () => post("/strava/sync", {});
```

(Connecting is a full browser redirect, not a fetch call, so there's no `connectStrava` API function — the component navigates directly.)

- [x] **Step 2: Add the `RefreshCw` icon import**

In `PlannerDashboard.jsx`, add `RefreshCw` to the existing `lucide-react` import list (it already imports `Dumbbell` for the Training Tracker header — `RefreshCw` goes right after it):

```javascript
  Dumbbell,
  RefreshCw,
```

- [x] **Step 3: Add Strava state**

In the "Training tracker state" section (near `trainingEntries`/`trainingLoaded`/`trainingError`), add:

```javascript
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaLastSyncedAt, setStravaLastSyncedAt] = useState(null);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaSyncError, setStravaSyncError] = useState(null);
```

- [x] **Step 4: Load Strava status and auto-sync on mount**

Add a new effect alongside the other domain-load effects (after the "Load training log" effect):

```javascript
  // Load Strava connection status, then auto-sync in the background if connected
  useEffect(() => {
    (async () => {
      try {
        const status = await api.getStravaStatus();
        setStravaConnected(status.connected);
        setStravaLastSyncedAt(status.lastSyncedAt);
        if (status.connected) {
          try {
            const result = await api.syncStrava();
            setStravaLastSyncedAt(result.lastSyncedAt);
            const entries = await api.getTrainingEntries();
            setTrainingEntries(entries || []);
          } catch (e) {
            // Auto-fire-on-mount failures are silent by design (spec
            // §Error handling) — the manual "Sync Strava" button is the
            // user-visible fallback. Re-check status in case the backend
            // deleted the tokens row (revoked refresh token, see routes/
            // strava.js) — this flips the UI back to "Connect Strava"
            // instead of leaving a dead "Sync Strava" button behind.
            console.error("Strava auto-sync failed:", e);
            try {
              const recheck = await api.getStravaStatus();
              setStravaConnected(recheck.connected);
              setStravaLastSyncedAt(recheck.lastSyncedAt);
            } catch (e2) {
              // status endpoint unreachable — leave state as-is
            }
          }
        }
      } catch (e) {
        // status endpoint unreachable — leave stravaConnected false
      }
    })();
  }, []);
```

- [x] **Step 5: Add the manual sync handler and connect handler**

Add near the other training-tracker functions (`addTrainingEntry`/`deleteTrainingEntry`):

```javascript
  function connectStrava() {
    window.location.href = "/api/strava/connect";
  }

  async function syncStravaNow() {
    setStravaSyncing(true);
    try {
      const result = await api.syncStrava();
      setStravaLastSyncedAt(result.lastSyncedAt);
      const entries = await api.getTrainingEntries();
      setTrainingEntries(entries || []);
      setStravaSyncError(null);
    } catch (e) {
      setStravaSyncError("Strava sync failed — try again.");
      // Same re-check as the auto-sync path: a revoked refresh token
      // means the backend already deleted strava_tokens, so flip the UI
      // back to "Connect Strava" instead of showing a dead sync button.
      try {
        const recheck = await api.getStravaStatus();
        setStravaConnected(recheck.connected);
        setStravaLastSyncedAt(recheck.lastSyncedAt);
      } catch (e2) {
        // status endpoint unreachable — leave state as-is
      }
    } finally {
      setStravaSyncing(false);
    }
  }

  function formatRelativeSync(ms) {
    if (!ms) return "Never";
    const diffMin = Math.round((Date.now() - ms) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(ms).toLocaleDateString();
  }
```

- [x] **Step 6: Add the header UI**

In the Training Tracker header (the `<div>` containing the `TRAINING TRACKER` label and the weekly-stats `<span>`, around where `weeklyTrainingStats` is rendered), add a second row below the existing header row:

```jsx
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {stravaConnected ? (
                <>
                  <span className="dp-mono" style={{ fontSize: 10.5, opacity: 0.75 }}>
                    Strava: {formatRelativeSync(stravaLastSyncedAt)}
                  </span>
                  <button
                    onClick={syncStravaNow}
                    disabled={stravaSyncing}
                    className="dp-mono"
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      border: "1.5px solid #FC4C02", background: stravaSyncing ? "transparent" : "#FC4C02",
                      color: stravaSyncing ? "#FC4C02" : "#FFF6EE", cursor: stravaSyncing ? "default" : "pointer",
                      padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 2,
                    }}
                  >
                    <RefreshCw size={12} /> {stravaSyncing ? "Syncing…" : "Sync Strava"}
                  </button>
                </>
              ) : (
                <button
                  onClick={connectStrava}
                  className="dp-mono"
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    border: "1.5px solid #FC4C02", background: "#FC4C02", color: "#FFF6EE",
                    cursor: "pointer", padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 2,
                  }}
                >
                  <RefreshCw size={12} /> Connect Strava
                </button>
              )}
            </div>

            {stravaSyncError && (
              <div className="dp-mono" style={{ background: "#4A241A", color: "#F4E3DC", padding: "6px 10px", fontSize: 11 }}>
                {stravaSyncError}
              </div>
            )}
```

Place this new block immediately after the existing header `<div>` (the one with `TRAINING TRACKER` + weekly stats) and before the existing `{trainingError && (...)}` block, so the layout reads: title row → Strava row → error banners → add-entry form → entries list.

- [x] **Step 7: Verify in the browser**

This step assumes Task 3's Prerequisite (you've completed the manual OAuth click and `/api/strava/status` returns `connected:true`) is done.

```bash
cd dashboard && npm run dev
```

Open `http://localhost:5173`. Confirm:
- The Training Tracker header shows "Strava: Just now" (or similar) automatically, without clicking anything — the on-mount sync fired.
- Any Strava activities you have show up in the training entries list below, with correct type/duration/distance.
- Click "Sync Strava" manually — button shows "Syncing…" then returns to "Sync Strava", label updates.
- Stop the backend (find the PID on port 3001 and kill it), reload the page, click "Sync Strava" — confirm the error banner "Strava sync failed — try again." appears and the page doesn't crash. Restart the backend afterward.

- [x] **Step 8: Commit**

```bash
git add dashboard/frontend/src/api.js dashboard/frontend/src/PlannerDashboard.jsx
git commit -m "feat(dashboard): wire Strava connect/sync into Training Tracker UI"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** OAuth connect/callback (Task 3) ✓, sync endpoint with mapping/dedup/last_synced_at semantics (Task 3) ✓, schema changes (Task 1) ✓, on-mount auto-sync + manual fallback button (Task 4) ✓, error handling for not-connected/refresh-failure/API-down (Task 3 status codes + Task 4 error display) ✓, `.env` credential handling (Task 3) ✓. Cron/OS-scheduler and Garmin integration are explicitly out of scope per the spec and this plan doesn't touch either.
- **Ambiguity resolved:** the spec's "after = last_synced_at (or account creation time if never synced)" was ambiguous about *whose* account creation — this plan adds a `connected_at` column (when the row was first written in *this app*, not Strava's actual signup date), and the first sync uses `connected_at - 30 days` as its cursor, so the very first sync actually surfaces a useful backfill window instead of returning `synced: 0` (an Opus review of this plan caught that an un-bounded "since connecting" cursor would look broken on first run; 30 days is a reasonable personal-use default, not tied to any spec number).
- **Revoked-token recovery:** an Opus review also caught that the original draft left the `strava_tokens` row in place after a 401 refresh failure, so `/status` would keep reporting `connected: true` forever and the UI would be stuck showing a dead "Sync Strava" button. Fixed: the `/sync` route deletes the row on refresh failure (spec §Error handling's "shows Connect Strava again on next load"), and both frontend sync paths (auto-mount and manual button) re-check `/status` after any failure so the UI reflects it without needing a full page reload.
- **Type consistency:** `strava_activity_id` (Task 1 schema) → `insertTrainingEntry`'s 8th bound param (Task 3) → nothing in Task 4 reads it directly (frontend gets entries back through the existing `toApi` shape in `routes/training.js`, unchanged). `getStravaStatus`/`syncStrava` (Task 4 api.js) match `/status` and `/sync` response shapes exactly as defined in Task 3.
- **Insert failures during sync:** `INSERT OR IGNORE` silently drops rows that violate the dedup index *or* any other constraint (e.g. a malformed activity missing `moving_time` would compute a `NULL` duration and get silently skipped by the `NOT NULL` constraint on `training_entries.duration`). This is intentional for dedup but means "missing" activities during manual testing may be silently-rejected malformed data, not necessarily a sync bug — worth knowing when verifying Task 4.
