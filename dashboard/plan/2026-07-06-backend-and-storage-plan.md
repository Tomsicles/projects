# 2026-07-06 — Sub-project 1: Backend + SQLite storage + frontend port

Scope: replace `window.storage` with a real Express + SQLite backend and port
`planner_dashboard.jsx` to call it. NO flight-API, NO Strava/Garmin, NO cron,
NO deployment — those are later sub-projects (see `PROJECT_SPEC.md` build order).

## 0. Library choices (decided, do not re-litigate)

| Choice | Justification |
|---|---|
| `express` (v4) | Minimal, spec-suggested, no framework overhead for ~25 endpoints |
| `better-sqlite3` | Spec-favored; synchronous API (no async ceremony in route handlers), single file db, zero server — right fit for single-user app |
| `vite` + `@vitejs/plugin-react` | Fastest way to host the existing JSX component standalone; dev proxy solves CORS |
| `lucide-react` | Already imported by `planner_dashboard.jsx` line 2–23 |
| `concurrently` | One command to run backend + frontend in dev |
| `crypto.randomUUID()` (Node builtin) | Server-side row ids; replaces the jsx `uid()` for persisted entities. No nanoid dep needed |
| No ORM, no TypeScript | 8 small tables; keep it plain JS like the existing component |

## 1. Target file/folder layout

```
dashboard/
  backend/
    package.json            # "type": "module"; deps: express, better-sqlite3
    .gitignore              # data/
    data/                   # dashboard.db lives here (gitignored)
    src/
      server.js             # Express app entry, listens on :3001
      db.js                 # opens db, runs schema, runs first-boot seeds
      seeds.js              # DEFAULT_QUICK_LINKS + SEED_TRIP_* copied from jsx
      routes/
        tasks.js
        quickLinks.js
        notes.js
        deadlines.js
        trips.js            # destinations + price logs
        training.js
        settings.js         # dark mode
  frontend/
    package.json            # deps: react, react-dom, lucide-react; dev: vite
    vite.config.js          # proxy /api -> http://localhost:3001
    index.html
    src/
      main.jsx              # mounts <PlannerDashboard/>
      PlannerDashboard.jsx  # ported copy of ../planner_dashboard.jsx
      api.js                # thin fetch wrapper, one function per endpoint
  package.json              # scripts: dev (concurrently), install-all
  planner_dashboard.jsx     # KEEP as reference artifact original; do not delete
```

## 2. SQLite schema (derived from actual jsx state shapes — do not add fields)

Source of truth for shapes (line refs into `planner_dashboard.jsx`):
tasks L523, quick links L37/L427, notes L458, deadlines L693, destinations
L51/L608, price logs L61/L622, training L554–562, dark mode L312/L661.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- jsx: tasksByDay = { "YYYY-MM-DD": [{ id, text, done, category }] }
CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  day        TEXT NOT NULL,                     -- "YYYY-MM-DD" key of tasksByDay
  category   TEXT NOT NULL DEFAULT 'work'
             CHECK (category IN ('work','study')),
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,        -- 0/1
  created_at INTEGER NOT NULL                   -- ms epoch; preserves in-day append order
);
CREATE INDEX IF NOT EXISTS idx_tasks_day ON tasks(day);

-- jsx: { id, label, url }
CREATE TABLE IF NOT EXISTS quick_links (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL                   -- bar order; new links append (L427)
);

-- jsx: { id, title, text, createdAt } (createdAt = Date.now(), L458)
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT 'Untitled',
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL                   -- ms epoch; UI shows newest first
);

-- jsx: { id, title, module, dueDate, done } (L693)
CREATE TABLE IF NOT EXISTS deadlines (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  module   TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL,                       -- "YYYY-MM-DD"
  done     INTEGER NOT NULL DEFAULT 0
);

-- jsx: { id, name, country } (L51, L608)
CREATE TABLE IF NOT EXISTS trip_destinations (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT ''
);

-- jsx: { id, destId, price, dateChecked, tripStart, tripEnd, airlines, notes } (L61, L622)
-- deleteDestination (L613) also removes its logs -> model as ON DELETE CASCADE
CREATE TABLE IF NOT EXISTS trip_price_logs (
  id           TEXT PRIMARY KEY,
  dest_id      TEXT NOT NULL REFERENCES trip_destinations(id) ON DELETE CASCADE,
  price        REAL NOT NULL,
  date_checked TEXT NOT NULL,                   -- "YYYY-MM-DD"
  trip_start   TEXT NOT NULL,
  trip_end     TEXT NOT NULL,
  airlines     TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_price_logs_dest ON trip_price_logs(dest_id);

-- jsx: { id, date, type, duration, distance, notes } (L554-562)
CREATE TABLE IF NOT EXISTS training_entries (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,                     -- "YYYY-MM-DD"
  type       TEXT NOT NULL CHECK (type IN ('run','gym','other')),
  duration   REAL NOT NULL,                     -- minutes (weekly stats sum L721)
  distance   REAL,                              -- nullable (L560: null when blank)
  notes      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL                   -- newest-first tiebreak within a date
);

-- dark mode etc. (jsx key "dashboard-dark-mode", boolean)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                           -- JSON-encoded value
);
```

API JSON stays **camelCase exactly as in the jsx** (`destId`, `dateChecked`,
`tripStart`, `tripEnd`, `dueDate`, `createdAt`, `done` as boolean). Route
handlers map to/from snake_case columns and cast `done` 0/1 <-> boolean.

First-boot seeding (in `db.js`, only when the table is empty):
- `quick_links` <- `DEFAULT_QUICK_LINKS` (jsx L36–43)
- `trip_destinations` <- `SEED_TRIP_DESTINATIONS` (L50–58)
- `trip_price_logs` <- `SEED_TRIP_LOGS` (L60–68)
This replicates the artifact's default-state behavior; the frontend's seed
constants then become dead weight and its initial state becomes `[]`.

## 3. API endpoints

All under `/api`. 201 on create (returns created row), 204 on delete,
404 for unknown id, 400 for failed validation (same rules the jsx enforces:
non-empty task text L519, price > 0 + both trip dates L621, duration > 0 L553,
title + dueDate required L690, label + url required L425).

| # | Method | Path | Purpose |
|---|---|---|---|
| 1 | GET | `/api/health` | liveness check |
| 2 | GET | `/api/tasks` | ALL tasks, returned grouped as `{ [day]: Task[] }` — same shape as `tasksByDay`, so rollover/urgency logic (L476–515) works unchanged. All-history fetch is fine single-user |
| 3 | POST | `/api/tasks` | body `{day, category, text}` -> new task (`done:false`) |
| 4 | PATCH | `/api/tasks/:id` | body `{done}` — toggle (L529) |
| 5 | DELETE | `/api/tasks/:id` | delete task (L536) |
| 6 | GET | `/api/quick-links` | list, ordered by `sort_order` |
| 7 | POST | `/api/quick-links` | body `{label, url}`; server appends max+1 sort_order |
| 8 | DELETE | `/api/quick-links/:id` | delete link (no edit exists in UI) |
| 9 | GET | `/api/notes` | list, `created_at DESC` (UI prepends, L457) |
| 10 | POST | `/api/notes` | body `{title, text}`; server sets `createdAt` |
| 11 | DELETE | `/api/notes/:id` | delete note |
| 12 | GET | `/api/deadlines` | list (UI sorts client-side, L707) |
| 13 | POST | `/api/deadlines` | body `{title, module, dueDate}` |
| 14 | PATCH | `/api/deadlines/:id` | body `{done}` (L699) |
| 15 | DELETE | `/api/deadlines/:id` | delete deadline |
| 16 | GET | `/api/trip/destinations` | list destinations |
| 17 | POST | `/api/trip/destinations` | body `{name, country}` |
| 18 | DELETE | `/api/trip/destinations/:id` | delete + cascade its price logs (L613–616) |
| 19 | GET | `/api/trip/price-logs` | ALL logs flat — matches `tripPriceLogs` state; UI filters by `destId` (L645) |
| 20 | POST | `/api/trip/price-logs` | body `{destId, price, dateChecked, tripStart, tripEnd, airlines, notes}` |
| 21 | DELETE | `/api/trip/price-logs/:id` | delete one log (L638) |
| 22 | GET | `/api/training` | list entries (UI sorts by date desc, L726) |
| 23 | POST | `/api/training` | body `{date, type, duration, distance, notes}`; `distance` may be null |
| 24 | DELETE | `/api/training/:id` | delete entry |
| 25 | GET | `/api/settings/dark-mode` | -> `{value: boolean}` (default `false` when unset) |
| 26 | PUT | `/api/settings/dark-mode` | body `{value: boolean}` |

## 4. Ordered implementation steps

### Phase A — backend scaffold
- [x] A1. Create `dashboard/backend/package.json` (`"type":"module"`; deps
      `express`, `better-sqlite3`; script `"dev": "node --watch src/server.js"`).
- [x] A2. Create `backend/.gitignore` with `data/` and `node_modules/`.
- [x] A3. `backend/src/seeds.js` — copy the three seed constants verbatim from
      `planner_dashboard.jsx` L36–68.
- [x] A4. `backend/src/db.js` — open `data/dashboard.db` (create `data/` if
      missing), run the schema from §2, run first-boot seeds when tables empty.
- [x] A5. `backend/src/server.js` — express, `express.json()`, mount 7 routers,
      `/api/health`, 404 + error JSON middleware, listen on `PORT || 3001`.
- [x] A6. Implement `routes/` one file per domain per the table in §3.
      Prepared statements at module top; camelCase mapping helpers per file.
- [x] A7. Smoke-test every endpoint with curl (create/read/toggle/delete per
      domain; verify destination delete cascades logs; verify seeds appear in
      GET quick-links and trip endpoints on a fresh db).

### Phase B — frontend scaffold (still on window.storage; just make it run)
- [x] B1. Scaffold Vite React app in `dashboard/frontend/` (manual files, not
      `npm create`, to control layout): `index.html`, `vite.config.js`,
      `src/main.jsx`. Deps: `react`, `react-dom`, `lucide-react`; dev: `vite`,
      `@vitejs/plugin-react`.
- [x] B2. Copy `planner_dashboard.jsx` -> `frontend/src/PlannerDashboard.jsx`
      (leave the root copy untouched as the artifact reference).
- [x] B3. `vite.config.js`: proxy `/api` -> `http://localhost:3001`.
- [x] B4. Run `vite`; confirm UI renders. Storage loads will fail silently
      (all loads are try/catch'd) — expected at this step.

### Phase C — port persistence layer (one domain at a time; verify each before next)
- [x] C1. Write `frontend/src/api.js`: `fetch` wrapper (JSON, throws on !ok)
      plus one exported function per endpoint in §3.
- [x] C2. Port pattern, applied per domain — simplest first:
      1. quick links, 2. notes, 3. deadlines, 4. training, 5. trips,
      6. tasks, 7. dark mode.
      For each domain:
      - Load effect: replace `window.storage.get(...)` with the GET call;
        keep the `*Loaded` flag and `*Error` state exactly as-is.
      - DELETE the `persist*` callback and its watcher `useEffect` (the
        whole-blob-on-every-change pattern: L380–392, 394–406, 408–420,
        440–452, 572–585, 659–669, 674–686).
      - Mutation functions (`addTask`, `toggleTask`, `deleteTask`,
        `addQuickLink`, `deleteQuickLink`, `addNote`, `deleteNote`,
        `addDeadline`, `toggleDeadlineDone`, `deleteDeadline`,
        `addDestination`, `deleteDestination`, `addPriceLog`,
        `deletePriceLog`, `addTrainingEntry`, `deleteTrainingEntry`,
        dark-mode setter): call the API, update local state from the
        response (server now owns id/createdAt generation — remove `uid()`
        usage for persisted rows), and on failure set the domain's existing
        "Couldn't save — your changes may not persist." error string.
      - Frontend seed constants (`DEFAULT_QUICK_LINKS`, `SEED_TRIP_*`) —
        initial state becomes `[]`/`{}`; seeds now come from the db.
      - Tasks note: `toggleTask(sourceDay, id)` on carried-over tasks still
        works — ids are globally unique so PATCH by id alone is sufficient.
      - Remove the legacy `category: "work"` backfill map (L255–257); the
        column default covers it.
- [x] C3. Confirm NO `window.storage` references remain
      (`grep -n "window.storage" frontend/src/`).
- [x] C4. Untouched by design (frontend-only logic — verify no accidental
      edits): rollover targets + carried-task computation (L476–515),
      `nextWeekday` weekend skip (L158), `urgencyStyle` (L170), daily quote
      (L183), weekly training stats (L718), `destinationsSorted` best-price
      sort (L642), $400 `TRIP_BUDGET_CAP`, themes/dark-mode rendering.

### Phase D — dev integration
- [x] D1. `dashboard/package.json` with `concurrently`:
      `"dev": "concurrently \"npm --prefix backend run dev\" \"npm --prefix frontend run dev\""`
      plus an `install-all` script.
- [x] D2. Short `dashboard/README.md` (or a Run section in `CLAUDE.md`):
      Node 20+, `npm run install-all`, `npm run dev`, frontend at :5173,
      API at :3001, db file at `backend/data/dashboard.db`.

### Phase E — end-to-end verification checklist
- [x] E1. Fresh db: quick links show the 6 defaults; Trip Scanner shows the
      7 seeded destinations with seeded price history.
- [x] E2. Add a task, reload page -> persists. Toggle + delete -> persist.
- [x] E3. Backdate a task (insert with a past `day` via curl), reload ->
      appears carried on today (study) / next weekday (work) with urgency tag.
- [x] E4. Work column absent on weekend day cards (unchanged behavior).
- [x] E5. Delete a destination -> its price logs gone after reload (cascade).
- [x] E6. Add training entry without distance -> stored as null, weekly
      stats correct.
- [x] E7. Toggle dark mode, reload -> persists.
- [x] E8. Stop backend, try adding a note -> UI shows the existing
      "Couldn't save" error string, doesn't crash.

## 5. Explicitly out of scope (later sub-projects)
Flight-price API + cron scanning; Strava/Garmin sync + OAuth; hosting/deploy;
auth (single local user); DB migration tooling (schema created idempotently).
