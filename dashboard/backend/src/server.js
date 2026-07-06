import express from "express";
import "./db.js"; // ensures schema + seeds run before routes are hit

import tasksRouter from "./routes/tasks.js";
import quickLinksRouter from "./routes/quickLinks.js";
import notesRouter from "./routes/notes.js";
import deadlinesRouter from "./routes/deadlines.js";
import tripsRouter from "./routes/trips.js";
import trainingRouter from "./routes/training.js";
import settingsRouter from "./routes/settings.js";
import stravaRouter from "./routes/strava.js";

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/tasks", tasksRouter);
app.use("/api/quick-links", quickLinksRouter);
app.use("/api/notes", notesRouter);
app.use("/api/deadlines", deadlinesRouter);
app.use("/api/trip", tripsRouter);
app.use("/api/training", trainingRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/strava", stravaRouter);

// 404 for unknown /api routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "not found" });
});

// error middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`dashboard backend listening on http://localhost:${PORT}`);
});
