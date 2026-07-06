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
  // this is the resolved, bounded interpretation; see plan Self-Review Notes).
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
