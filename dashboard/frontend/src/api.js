// Thin fetch wrapper + one function per backend endpoint (see
// dashboard/plan/2026-07-06-backend-and-storage-plan.md §3).
// All requests are relative to /api; vite.config.js proxies that to
// the Express backend on :3001 in dev.

async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore body parse failure
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

function get(path) {
  return request(path, { method: "GET" });
}
function post(path, body) {
  return request(path, { method: "POST", body: JSON.stringify(body) });
}
function patch(path, body) {
  return request(path, { method: "PATCH", body: JSON.stringify(body) });
}
function put(path, body) {
  return request(path, { method: "PUT", body: JSON.stringify(body) });
}
function del(path) {
  return request(path, { method: "DELETE" });
}

// --- tasks ---
export const getTasks = () => get("/tasks");
export const createTask = (day, category, text) => post("/tasks", { day, category, text });
export const updateTaskDone = (id, done) => patch(`/tasks/${id}`, { done });
export const deleteTask = (id) => del(`/tasks/${id}`);

// --- quick links ---
export const getQuickLinks = () => get("/quick-links");
export const createQuickLink = (label, url) => post("/quick-links", { label, url });
export const deleteQuickLink = (id) => del(`/quick-links/${id}`);

// --- notes ---
export const getNotes = () => get("/notes");
export const createNote = (title, text) => post("/notes", { title, text });
export const deleteNote = (id) => del(`/notes/${id}`);

// --- deadlines ---
export const getDeadlines = () => get("/deadlines");
export const createDeadline = (title, module, dueDate) => post("/deadlines", { title, module, dueDate });
export const updateDeadlineDone = (id, done) => patch(`/deadlines/${id}`, { done });
export const deleteDeadline = (id) => del(`/deadlines/${id}`);

// --- trip destinations + price logs ---
export const getTripDestinations = () => get("/trip/destinations");
export const createTripDestination = (name, country) => post("/trip/destinations", { name, country });
export const deleteTripDestination = (id) => del(`/trip/destinations/${id}`);

export const getTripPriceLogs = () => get("/trip/price-logs");
export const createTripPriceLog = (log) => post("/trip/price-logs", log);
export const deleteTripPriceLog = (id) => del(`/trip/price-logs/${id}`);

// --- training ---
export const getTrainingEntries = () => get("/training");
export const createTrainingEntry = (entry) => post("/training", entry);
export const deleteTrainingEntry = (id) => del(`/training/${id}`);

// --- settings ---
export const getDarkMode = () => get("/settings/dark-mode");
export const setDarkMode = (value) => put("/settings/dark-mode", { value });

// --- strava ---
export const getStravaStatus = () => get("/strava/status");
export const syncStrava = () => post("/strava/sync", {});
