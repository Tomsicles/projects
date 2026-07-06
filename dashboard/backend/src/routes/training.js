import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";

const router = Router();

const selectAll = db.prepare("SELECT * FROM training_entries");
const insert = db.prepare(
  `INSERT INTO training_entries (id, date, type, duration, distance, notes, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const getById = db.prepare("SELECT * FROM training_entries WHERE id = ?");
const deleteById = db.prepare("DELETE FROM training_entries WHERE id = ?");

const VALID_TYPES = new Set(["run", "gym", "other"]);

function toApi(row) {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    duration: row.duration,
    distance: row.distance === null || row.distance === undefined ? null : row.distance,
    notes: row.notes,
  };
}

router.get("/", (req, res) => {
  res.json(selectAll.all().map(toApi));
});

router.post("/", (req, res) => {
  const { date, type, duration, distance, notes } = req.body || {};
  const numDuration = parseFloat(duration);
  if (!numDuration || numDuration <= 0) {
    return res.status(400).json({ error: "duration > 0 is required" });
  }
  const safeType = VALID_TYPES.has(type) ? type : "run";
  const numDistance = distance === "" || distance === null || distance === undefined
    ? null
    : parseFloat(distance);
  const id = crypto.randomUUID();
  insert.run(
    id,
    date || new Date().toISOString().slice(0, 10),
    safeType,
    numDuration,
    Number.isFinite(numDistance) ? numDistance : null,
    typeof notes === "string" ? notes.trim() : "",
    Date.now()
  );
  res.status(201).json(toApi(getById.get(id)));
});

router.delete("/:id", (req, res) => {
  const row = getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  deleteById.run(req.params.id);
  res.status(204).end();
});

export default router;
