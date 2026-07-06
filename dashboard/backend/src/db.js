import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { DEFAULT_QUICK_LINKS, SEED_TRIP_DESTINATIONS, SEED_TRIP_LOGS } from "./seeds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "dashboard.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  day        TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'work'
             CHECK (category IN ('work','study')),
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_day ON tasks(day);

CREATE TABLE IF NOT EXISTS quick_links (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT 'Untitled',
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deadlines (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  module   TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL,
  done     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trip_destinations (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS trip_price_logs (
  id           TEXT PRIMARY KEY,
  dest_id      TEXT NOT NULL REFERENCES trip_destinations(id) ON DELETE CASCADE,
  price        REAL NOT NULL,
  date_checked TEXT NOT NULL,
  trip_start   TEXT NOT NULL,
  trip_end     TEXT NOT NULL,
  airlines     TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_price_logs_dest ON trip_price_logs(dest_id);

CREATE TABLE IF NOT EXISTS training_entries (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('run','gym','other')),
  duration   REAL NOT NULL,
  distance   REAL,
  notes      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strava_tokens (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  expires_at     INTEGER NOT NULL,
  connected_at   INTEGER NOT NULL,
  last_synced_at INTEGER
);
`);

// First-boot seeding — only when the relevant table is empty.
function seedIfEmpty() {
  const quickLinkCount = db.prepare("SELECT COUNT(*) AS c FROM quick_links").get().c;
  if (quickLinkCount === 0) {
    const insert = db.prepare(
      "INSERT INTO quick_links (id, label, url, sort_order) VALUES (?, ?, ?, ?)"
    );
    const tx = db.transaction((links) => {
      links.forEach((l, i) => insert.run(l.id, l.label, l.url, i));
    });
    tx(DEFAULT_QUICK_LINKS);
  }

  const destCount = db.prepare("SELECT COUNT(*) AS c FROM trip_destinations").get().c;
  if (destCount === 0) {
    const insertDest = db.prepare(
      "INSERT INTO trip_destinations (id, name, country) VALUES (?, ?, ?)"
    );
    const insertLog = db.prepare(
      `INSERT INTO trip_price_logs
        (id, dest_id, price, date_checked, trip_start, trip_end, airlines, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = db.transaction((dests, logs) => {
      dests.forEach((d) => insertDest.run(d.id, d.name, d.country));
      logs.forEach((l) =>
        insertLog.run(l.id, l.destId, l.price, l.dateChecked, l.tripStart, l.tripEnd, l.airlines, l.notes)
      );
    });
    tx(SEED_TRIP_DESTINATIONS, SEED_TRIP_LOGS);
  }
}

seedIfEmpty();

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
