import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";

const router = Router();

const selectAll = db.prepare("SELECT * FROM quick_links ORDER BY sort_order ASC");
const maxSortOrder = db.prepare("SELECT MAX(sort_order) AS m FROM quick_links");
const insert = db.prepare(
  "INSERT INTO quick_links (id, label, url, sort_order) VALUES (?, ?, ?, ?)"
);
const getById = db.prepare("SELECT * FROM quick_links WHERE id = ?");
const deleteById = db.prepare("DELETE FROM quick_links WHERE id = ?");

function toApi(row) {
  return { id: row.id, label: row.label, url: row.url };
}

router.get("/", (req, res) => {
  res.json(selectAll.all().map(toApi));
});

router.post("/", (req, res) => {
  const { label, url } = req.body || {};
  const trimmedLabel = typeof label === "string" ? label.trim() : "";
  let trimmedUrl = typeof url === "string" ? url.trim() : "";
  if (!trimmedLabel || !trimmedUrl) {
    return res.status(400).json({ error: "label and url are required" });
  }
  if (!/^https?:\/\//i.test(trimmedUrl)) trimmedUrl = `https://${trimmedUrl}`;
  const nextOrder = (maxSortOrder.get().m ?? -1) + 1;
  const id = crypto.randomUUID();
  insert.run(id, trimmedLabel, trimmedUrl, nextOrder);
  res.status(201).json(toApi(getById.get(id)));
});

router.delete("/:id", (req, res) => {
  const row = getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  deleteById.run(req.params.id);
  res.status(204).end();
});

export default router;
