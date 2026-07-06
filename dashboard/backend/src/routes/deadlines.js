import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";

const router = Router();

const selectAll = db.prepare("SELECT * FROM deadlines");
const insert = db.prepare(
  "INSERT INTO deadlines (id, title, module, due_date, done) VALUES (?, ?, ?, ?, 0)"
);
const getById = db.prepare("SELECT * FROM deadlines WHERE id = ?");
const updateDone = db.prepare("UPDATE deadlines SET done = ? WHERE id = ?");
const deleteById = db.prepare("DELETE FROM deadlines WHERE id = ?");

function toApi(row) {
  return {
    id: row.id,
    title: row.title,
    module: row.module,
    dueDate: row.due_date,
    done: !!row.done,
  };
}

router.get("/", (req, res) => {
  res.json(selectAll.all().map(toApi));
});

router.post("/", (req, res) => {
  const { title, module, dueDate } = req.body || {};
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (!trimmedTitle || !dueDate) {
    return res.status(400).json({ error: "title and dueDate are required" });
  }
  const id = crypto.randomUUID();
  insert.run(id, trimmedTitle, (typeof module === "string" ? module.trim() : ""), dueDate);
  res.status(201).json(toApi(getById.get(id)));
});

router.patch("/:id", (req, res) => {
  const row = getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  const done = !!req.body?.done;
  updateDone.run(done ? 1 : 0, req.params.id);
  res.json(toApi(getById.get(req.params.id)));
});

router.delete("/:id", (req, res) => {
  const row = getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  deleteById.run(req.params.id);
  res.status(204).end();
});

export default router;
