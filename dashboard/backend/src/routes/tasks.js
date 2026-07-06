import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";

const router = Router();

const selectAll = db.prepare("SELECT * FROM tasks ORDER BY day ASC, created_at ASC");
const insertTask = db.prepare(
  "INSERT INTO tasks (id, day, category, text, done, created_at) VALUES (?, ?, ?, ?, 0, ?)"
);
const getById = db.prepare("SELECT * FROM tasks WHERE id = ?");
const updateDone = db.prepare("UPDATE tasks SET done = ? WHERE id = ?");
const deleteById = db.prepare("DELETE FROM tasks WHERE id = ?");

function toApi(row) {
  return { id: row.id, text: row.text, done: !!row.done, category: row.category };
}

// GET /api/tasks -> { [day]: Task[] }
router.get("/", (req, res) => {
  const rows = selectAll.all();
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.day]) grouped[row.day] = [];
    grouped[row.day].push(toApi(row));
  }
  res.json(grouped);
});

// POST /api/tasks  { day, category, text }
router.post("/", (req, res) => {
  const { day, category, text } = req.body || {};
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!day || !trimmed) {
    return res.status(400).json({ error: "day and non-empty text are required" });
  }
  const cat = category === "study" ? "study" : "work";
  const id = crypto.randomUUID();
  insertTask.run(id, day, cat, trimmed, Date.now());
  const row = getById.get(id);
  res.status(201).json(toApi(row));
});

// PATCH /api/tasks/:id  { done }
router.patch("/:id", (req, res) => {
  const row = getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const done = !!req.body?.done;
  updateDone.run(done ? 1 : 0, req.params.id);
  res.json(toApi(getById.get(req.params.id)));
});

// DELETE /api/tasks/:id
router.delete("/:id", (req, res) => {
  const row = getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  deleteById.run(req.params.id);
  res.status(204).end();
});

export default router;
