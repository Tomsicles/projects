import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";

const router = Router();

const selectAll = db.prepare("SELECT * FROM notes ORDER BY created_at DESC");
const insert = db.prepare(
  "INSERT INTO notes (id, title, text, created_at) VALUES (?, ?, ?, ?)"
);
const getById = db.prepare("SELECT * FROM notes WHERE id = ?");
const deleteById = db.prepare("DELETE FROM notes WHERE id = ?");

function toApi(row) {
  return { id: row.id, title: row.title, text: row.text, createdAt: row.created_at };
}

router.get("/", (req, res) => {
  res.json(selectAll.all().map(toApi));
});

router.post("/", (req, res) => {
  const { title, text } = req.body || {};
  const trimmedText = typeof text === "string" ? text.trim() : "";
  if (!trimmedText) return res.status(400).json({ error: "text is required" });
  const trimmedTitle = (typeof title === "string" ? title.trim() : "") || "Untitled";
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  insert.run(id, trimmedTitle, trimmedText, createdAt);
  res.status(201).json(toApi(getById.get(id)));
});

router.delete("/:id", (req, res) => {
  const row = getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  deleteById.run(req.params.id);
  res.status(204).end();
});

export default router;
