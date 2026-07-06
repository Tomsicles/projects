import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";

const router = Router();

const selectAllDest = db.prepare("SELECT * FROM trip_destinations");
const insertDest = db.prepare(
  "INSERT INTO trip_destinations (id, name, country) VALUES (?, ?, ?)"
);
const getDestById = db.prepare("SELECT * FROM trip_destinations WHERE id = ?");
const deleteDestById = db.prepare("DELETE FROM trip_destinations WHERE id = ?");

const selectAllLogs = db.prepare("SELECT * FROM trip_price_logs");
const insertLog = db.prepare(
  `INSERT INTO trip_price_logs
    (id, dest_id, price, date_checked, trip_start, trip_end, airlines, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const getLogById = db.prepare("SELECT * FROM trip_price_logs WHERE id = ?");
const deleteLogById = db.prepare("DELETE FROM trip_price_logs WHERE id = ?");

function destToApi(row) {
  return { id: row.id, name: row.name, country: row.country };
}

function logToApi(row) {
  return {
    id: row.id,
    destId: row.dest_id,
    price: row.price,
    dateChecked: row.date_checked,
    tripStart: row.trip_start,
    tripEnd: row.trip_end,
    airlines: row.airlines,
    notes: row.notes,
  };
}

router.get("/destinations", (req, res) => {
  res.json(selectAllDest.all().map(destToApi));
});

router.post("/destinations", (req, res) => {
  const { name, country } = req.body || {};
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) return res.status(400).json({ error: "name is required" });
  const id = crypto.randomUUID();
  insertDest.run(id, trimmedName, typeof country === "string" ? country.trim() : "");
  res.status(201).json(destToApi(getDestById.get(id)));
});

// FK ON DELETE CASCADE removes the destination's price logs too.
router.delete("/destinations/:id", (req, res) => {
  const row = getDestById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  deleteDestById.run(req.params.id);
  res.status(204).end();
});

router.get("/price-logs", (req, res) => {
  res.json(selectAllLogs.all().map(logToApi));
});

router.post("/price-logs", (req, res) => {
  const { destId, price, dateChecked, tripStart, tripEnd, airlines, notes } = req.body || {};
  const numPrice = parseFloat(price);
  if (!destId || !numPrice || numPrice <= 0 || !tripStart || !tripEnd) {
    return res.status(400).json({ error: "destId, price > 0, tripStart, tripEnd are required" });
  }
  const dest = getDestById.get(destId);
  if (!dest) return res.status(400).json({ error: "unknown destId" });
  const id = crypto.randomUUID();
  insertLog.run(
    id,
    destId,
    numPrice,
    dateChecked || new Date().toISOString().slice(0, 10),
    tripStart,
    tripEnd,
    typeof airlines === "string" ? airlines.trim() : "",
    typeof notes === "string" ? notes.trim() : ""
  );
  res.status(201).json(logToApi(getLogById.get(id)));
});

router.delete("/price-logs/:id", (req, res) => {
  const row = getLogById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  deleteLogById.run(req.params.id);
  res.status(204).end();
});

export default router;
