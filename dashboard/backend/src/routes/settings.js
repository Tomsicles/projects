import { Router } from "express";
import { db } from "../db.js";

const router = Router();

const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const upsertSetting = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);

router.get("/dark-mode", (req, res) => {
  const row = getSetting.get("dashboard-dark-mode");
  res.json({ value: row ? JSON.parse(row.value) : false });
});

router.put("/dark-mode", (req, res) => {
  const value = !!req.body?.value;
  upsertSetting.run("dashboard-dark-mode", JSON.stringify(value));
  res.json({ value });
});

export default router;
