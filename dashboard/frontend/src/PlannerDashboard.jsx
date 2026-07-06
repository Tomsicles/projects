import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Circle,
  CheckCircle2,
  Flame,
  Briefcase,
  BookOpen,
  CalendarDays,
  ListChecks,
  Dumbbell,
  Plane,
  ExternalLink,
  Link2,
  StickyNote,
  Trash2,
  Sun,
  Moon,
  GraduationCap,
} from "lucide-react";
import * as api from "./api.js";

const CATEGORIES = [
  { key: "work", label: "Work", accent: "#5C7A99", Icon: Briefcase },
  { key: "study", label: "Study", accent: "#7A8F52", Icon: BookOpen },
];

const TRAINING_TYPES = [
  { key: "run", label: "Run", accent: "#3E7C86" },
  { key: "gym", label: "Gym", accent: "#8A5C99" },
  { key: "other", label: "Other", accent: "#B08A52" },
];

const TRIP_BUDGET_CAP = 400;

// Seed data (default quick links, watchlist destinations, price logs) now
// lives server-side in backend/src/seeds.js and is inserted into SQLite on
// first boot. The frontend starts empty and loads everything from the API.

const LIGHT_THEME = {
  pageBg: "#EFEAE1",
  cardBg: "#FBF8F2",
  cardBorder: "#2B2620",
  text: "#2B2620",
  mutedText: "#5C5548",
  inputBg: "#FFFFFF",
  hoverTint: "rgba(43,38,32,0.05)",
  todayCardBg: "#2B2620",
  notesBg: "#FFFBF0",
  noteCardBg: "#FFF6D9",
  noteCardBorder: "#E8D485",
};

const DARK_THEME = {
  pageBg: "#1A1611",
  cardBg: "#2A241C",
  cardBorder: "#5C5343",
  text: "#F0EAE0",
  mutedText: "#B8AE9C",
  inputBg: "#332C22",
  hoverTint: "rgba(255,255,255,0.06)",
  todayCardBg: "#40331F",
  notesBg: "#332C1A",
  noteCardBg: "#463A1E",
  noteCardBorder: "#6B5A2A",
};

const MOTIVATIONAL_QUOTES = [
  "Small steps still move the needle.",
  "Done is better than perfect.",
  "You don't have to see the whole staircase, just the next step.",
  "Discipline is choosing what you want most over what you want now.",
  "Progress, not perfection.",
  "The best time to start was earlier. The next best time is now.",
  "One task at a time beats ten half-finished ones.",
  "Future you is watching — make them proud.",
  "Momentum loves a checklist.",
  "Slow is smooth, smooth is fast.",
  "Consistency beats intensity.",
  "You've handled harder days than this one.",
  "Tiny wins add up to big changes.",
  "Focus on the next right action.",
  "Rest is part of the work, not a break from it.",
  "Clarity comes from doing, not just thinking.",
  "Your effort today is an investment, not an expense.",
  "Nobody regrets starting early.",
  "A little progress each day adds up to big results.",
  "Show up. That's most of the battle.",
  "Energy flows where attention goes.",
  "Better a little late than never started.",
  "The hardest part is usually just beginning.",
  "You are one task closer than you were yesterday.",
  "Trust the process, then keep showing up for it.",
];

function fmtKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmtLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(keyA, keyB) {
  const a = new Date(keyA + "T00:00:00");
  const b = new Date(keyB + "T00:00:00");
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function isWeekendDate(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// Given a date key, returns itself if it's a weekday, or the following Monday if it falls on a weekend.
function nextWeekday(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  while (isWeekendDate(d)) {
    d.setDate(d.getDate() + 1);
  }
  return fmtKey(d);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function urgencyStyle(carriedDays) {
  if (carriedDays <= 0) return null;
  if (carriedDays === 1) {
    return { badgeBg: "#F4E3DC", badgeColor: "#B5502F", border: "#D98B6A", pulse: false, icon: false };
  }
  if (carriedDays === 2) {
    return { badgeBg: "#F0C6AE", badgeColor: "#8A3A20", border: "#B5502F", pulse: false, icon: true };
  }
  return { badgeBg: "#B5502F", badgeColor: "#FFF6EE", border: "#8A3A20", pulse: true, icon: true };
}

// Deterministic per-day pick so it feels freshly random but stays the
// same all day — a simple string hash seeds the choice from the date key.
function pickDailyQuote(dateKey) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return MOTIVATIONAL_QUOTES[hash % MOTIVATIONAL_QUOTES.length];
}

export default function PlannerDashboard() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [viewMode, setViewMode] = useState("week"); // "week" | "today"
  const [tasksByDay, setTasksByDay] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [draftText, setDraftText] = useState({});
  const [addingFor, setAddingFor] = useState(null); // `${dayKey}:${category}`
  const [error, setError] = useState(null);
  const [todayKey, setTodayKey] = useState(() => fmtKey(new Date()));

  // --- Dark mode ---
  const [darkMode, setDarkMode] = useState(false);
  const [darkModeLoaded, setDarkModeLoaded] = useState(false);

  // --- Masters deadline tracker ---
  const [deadlines, setDeadlines] = useState([]);
  const [deadlinesLoaded, setDeadlinesLoaded] = useState(false);
  const [deadlinesError, setDeadlinesError] = useState(null);
  const [showAddDeadline, setShowAddDeadline] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState({ title: "", module: "", dueDate: "" });

  // --- Training tracker state ---
  const [trainingEntries, setTrainingEntries] = useState([]);
  const [trainingLoaded, setTrainingLoaded] = useState(false);
  const [trainingError, setTrainingError] = useState(null);

  // --- Trip scanner state ---
  const [tripDestinations, setTripDestinations] = useState([]);
  const [tripPriceLogs, setTripPriceLogs] = useState([]);
  const [tripDataLoaded, setTripDataLoaded] = useState(false);
  const [tripError, setTripError] = useState(null);
  const [selectedDestId, setSelectedDestId] = useState(null);
  const [showAddDestination, setShowAddDestination] = useState(false);
  const [destDraft, setDestDraft] = useState({ name: "", country: "" });
  const [logDraft, setLogDraft] = useState({ price: "", dateChecked: "", tripStart: "", tripEnd: "", airlines: "", notes: "" });

  // --- Quick links state ---
  const [quickLinks, setQuickLinks] = useState([]);
  const [quickLinksLoaded, setQuickLinksLoaded] = useState(false);
  const [quickLinksError, setQuickLinksError] = useState(null);
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });

  // --- Notes state ---
  const [notes, setNotes] = useState([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesError, setNotesError] = useState(null);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [noteDraft, setNoteDraft] = useState({ title: "", text: "" });
  const [trainingDraft, setTrainingDraft] = useState({
    date: todayKey,
    type: "run",
    duration: "",
    distance: "",
    notes: "",
  });

  // Load planner tasks
  useEffect(() => {
    (async () => {
      try {
        const grouped = await api.getTasks();
        setTasksByDay(grouped || {});
      } catch (e) {
        // no existing data / server unreachable — fine, starts empty
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Load training log
  useEffect(() => {
    (async () => {
      try {
        const entries = await api.getTrainingEntries();
        setTrainingEntries(entries || []);
      } catch (e) {
        // no existing data — fine
      } finally {
        setTrainingLoaded(true);
      }
    })();
  }, []);

  // Load trip scanner data
  useEffect(() => {
    (async () => {
      try {
        const destinations = await api.getTripDestinations();
        setTripDestinations(destinations || []);
      } catch (e) {
        // no existing data — fine
      }
      try {
        const logs = await api.getTripPriceLogs();
        setTripPriceLogs(logs || []);
      } catch (e) {
        // no existing data — fine
      } finally {
        setTripDataLoaded(true);
      }
    })();
  }, []);

  // Load dark mode preference
  useEffect(() => {
    (async () => {
      try {
        const result = await api.getDarkMode();
        setDarkMode(!!result?.value);
      } catch (e) {
        // default (light) already in state
      } finally {
        setDarkModeLoaded(true);
      }
    })();
  }, []);

  // Load Masters deadlines
  useEffect(() => {
    (async () => {
      try {
        const list = await api.getDeadlines();
        setDeadlines(list || []);
      } catch (e) {
        // no existing data — fine
      } finally {
        setDeadlinesLoaded(true);
      }
    })();
  }, []);

  // Load quick links
  useEffect(() => {
    (async () => {
      try {
        const list = await api.getQuickLinks();
        setQuickLinks(list || []);
      } catch (e) {
        // no existing data — fine
      } finally {
        setQuickLinksLoaded(true);
      }
    })();
  }, []);

  // Load notes
  useEffect(() => {
    (async () => {
      try {
        const list = await api.getNotes();
        setNotes(list || []);
      } catch (e) {
        // no existing data — fine
      } finally {
        setNotesLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const k = fmtKey(new Date());
      setTodayKey((prev) => (prev === k ? prev : k));
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  async function addQuickLink() {
    const label = linkDraft.label.trim();
    const url = linkDraft.url.trim();
    if (!label || !url) return;
    try {
      const created = await api.createQuickLink(label, url);
      setQuickLinks((prev) => [...prev, created]);
      setQuickLinksError(null);
      setLinkDraft({ label: "", url: "" });
      setShowAddLink(false);
    } catch (e) {
      setQuickLinksError("Couldn't save — your changes may not persist.");
    }
  }

  async function deleteQuickLink(id) {
    try {
      await api.deleteQuickLink(id);
      setQuickLinks((prev) => prev.filter((l) => l.id !== id));
      setQuickLinksError(null);
    } catch (e) {
      setQuickLinksError("Couldn't save — your changes may not persist.");
    }
  }

  function openQuickLink(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function addNote() {
    const text = noteDraft.text.trim();
    if (!text) return;
    try {
      const created = await api.createNote(noteDraft.title.trim(), text);
      setNotes((prev) => [created, ...prev]);
      setNotesError(null);
      setNoteDraft({ title: "", text: "" });
    } catch (e) {
      setNotesError("Couldn't save — your changes may not persist.");
    }
  }

  async function deleteNote(id) {
    try {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setNotesError(null);
    } catch (e) {
      setNotesError("Couldn't save — your changes may not persist.");
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayDateObj = useMemo(() => new Date(todayKey + "T00:00:00"), [todayKey]);

  const rolloverTargets = useMemo(
    () => ({
      work: nextWeekday(todayKey),
      study: todayKey,
    }),
    [todayKey]
  );

  const carriedByCategory = useMemo(() => {
    const map = { work: [], study: [] };
    Object.keys(tasksByDay).forEach((key) => {
      (tasksByDay[key] || []).forEach((t) => {
        const cat = t.category || "work";
        const target = rolloverTargets[cat] ?? todayKey;
        if (!t.done && key < target) {
          if (!map[cat]) map[cat] = [];
          map[cat].push({ ...t, sourceDay: key, carriedDays: daysBetween(key, target) });
        }
      });
    });
    Object.keys(map).forEach((cat) => map[cat].sort((a, b) => b.carriedDays - a.carriedDays));
    return map;
  }, [tasksByDay, rolloverTargets, todayKey]);

  function tasksForSection(dayKey, category) {
    const own = (tasksByDay[dayKey] || [])
      .filter((t) => (t.category || "work") === category)
      .map((t) => ({ ...t, sourceDay: dayKey, carriedDays: 0 }));

    const target = rolloverTargets[category] ?? todayKey;

    if (dayKey === target) {
      const carried = carriedByCategory[category] || [];
      return [...carried, ...own];
    }
    if (dayKey < todayKey) {
      return own.filter((t) => t.done);
    }
    return own;
  }

  function addTask(dayKey, category) {
    const draftKey = `${dayKey}:${category}`;
    const text = (draftText[draftKey] || "").trim();
    if (!text) return;
    setTasksByDay((prev) => {
      const list = prev[dayKey] ? [...prev[dayKey]] : [];
      list.push({ id: uid(), text, done: false, category });
      return { ...prev, [dayKey]: list };
    });
    setDraftText((prev) => ({ ...prev, [draftKey]: "" }));
  }

  function toggleTask(sourceDay, id) {
    setTasksByDay((prev) => {
      const list = (prev[sourceDay] || []).map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      return { ...prev, [sourceDay]: list };
    });
  }

  function deleteTask(sourceDay, id) {
    setTasksByDay((prev) => {
      const list = (prev[sourceDay] || []).filter((t) => t.id !== id);
      return { ...prev, [sourceDay]: list };
    });
  }

  function shiftWeek(delta) {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  }

  function addTrainingEntry() {
    const duration = parseFloat(trainingDraft.duration);
    if (!duration || duration <= 0) return;
    setTrainingEntries((prev) => [
      {
        id: uid(),
        date: trainingDraft.date || todayKey,
        type: trainingDraft.type,
        duration,
        distance: trainingDraft.distance ? parseFloat(trainingDraft.distance) : null,
        notes: trainingDraft.notes.trim(),
      },
      ...prev,
    ]);
    setTrainingDraft((prev) => ({ ...prev, duration: "", distance: "", notes: "" }));
  }

  function deleteTrainingEntry(id) {
    setTrainingEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const persistTripData = useCallback(async (destinations, logs) => {
    try {
      const r1 = await window.storage.set("trip-destinations", JSON.stringify(destinations));
      const r2 = await window.storage.set("trip-price-logs", JSON.stringify(logs));
      if (!r1 || !r2) setTripError("Couldn't save — your changes may not persist.");
      else setTripError(null);
    } catch (e) {
      setTripError("Couldn't save — your changes may not persist.");
    }
  }, []);

  useEffect(() => {
    if (tripDataLoaded) persistTripData(tripDestinations, tripPriceLogs);
  }, [tripDestinations, tripPriceLogs, tripDataLoaded, persistTripData]);

  function computeTripSpan(startKey, endKey) {
    if (!startKey || !endKey) return null;
    const start = new Date(startKey + "T00:00:00");
    const end = new Date(endKey + "T00:00:00");
    const days = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
    if (days <= 0) return null;
    let hasWeekend = false;
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (isWeekendDate(d)) {
        hasWeekend = true;
        break;
      }
    }
    return { days, hasWeekend };
  }

  function addDestination() {
    const name = destDraft.name.trim();
    if (!name) return;
    setTripDestinations((prev) => [...prev, { id: uid(), name, country: destDraft.country.trim() }]);
    setDestDraft({ name: "", country: "" });
    setShowAddDestination(false);
  }

  function deleteDestination(id) {
    setTripDestinations((prev) => prev.filter((d) => d.id !== id));
    setTripPriceLogs((prev) => prev.filter((l) => l.destId !== id));
    setSelectedDestId(null);
  }

  function addPriceLog(destId) {
    const price = parseFloat(logDraft.price);
    if (!price || price <= 0 || !logDraft.tripStart || !logDraft.tripEnd) return;
    setTripPriceLogs((prev) => [
      {
        id: uid(),
        destId,
        price,
        dateChecked: logDraft.dateChecked || todayKey,
        tripStart: logDraft.tripStart,
        tripEnd: logDraft.tripEnd,
        airlines: logDraft.airlines.trim(),
        notes: logDraft.notes.trim(),
      },
      ...prev,
    ]);
    setLogDraft({ price: "", dateChecked: "", tripStart: "", tripEnd: "", airlines: "", notes: "" });
  }

  function deletePriceLog(id) {
    setTripPriceLogs((prev) => prev.filter((l) => l.id !== id));
  }

  const destinationsSorted = useMemo(() => {
    return [...tripDestinations]
      .map((d) => {
        const logs = tripPriceLogs.filter((l) => l.destId === d.id);
        const bestPrice = logs.length ? Math.min(...logs.map((l) => l.price)) : null;
        const lastChecked = logs.length ? logs.reduce((a, b) => (a.dateChecked > b.dateChecked ? a : b)).dateChecked : null;
        return { ...d, logs, bestPrice, lastChecked };
      })
      .sort((a, b) => {
        if (a.bestPrice === null && b.bestPrice === null) return 0;
        if (a.bestPrice === null) return 1;
        if (b.bestPrice === null) return -1;
        return a.bestPrice - b.bestPrice;
      });
  }, [tripDestinations, tripPriceLogs]);

  // Dark mode persistence
  const persistDarkMode = useCallback(async (val) => {
    try {
      await window.storage.set("dashboard-dark-mode", JSON.stringify(val));
    } catch (e) {
      // non-critical — theme just won't persist
    }
  }, []);

  useEffect(() => {
    if (darkModeLoaded) persistDarkMode(darkMode);
  }, [darkMode, darkModeLoaded, persistDarkMode]);

  const theme = darkMode ? DARK_THEME : LIGHT_THEME;

  // Masters deadlines persistence + CRUD
  const persistDeadlines = useCallback(async (next) => {
    try {
      const result = await window.storage.set("masters-deadlines", JSON.stringify(next));
      if (!result) setDeadlinesError("Couldn't save — your changes may not persist.");
      else setDeadlinesError(null);
    } catch (e) {
      setDeadlinesError("Couldn't save — your changes may not persist.");
    }
  }, []);

  useEffect(() => {
    if (deadlinesLoaded) persistDeadlines(deadlines);
  }, [deadlines, deadlinesLoaded, persistDeadlines]);

  function addDeadline() {
    const title = deadlineDraft.title.trim();
    if (!title || !deadlineDraft.dueDate) return;
    setDeadlines((prev) => [
      ...prev,
      { id: uid(), title, module: deadlineDraft.module.trim(), dueDate: deadlineDraft.dueDate, done: false },
    ]);
    setDeadlineDraft({ title: "", module: "", dueDate: "" });
    setShowAddDeadline(false);
  }

  function toggleDeadlineDone(id) {
    setDeadlines((prev) => prev.map((d) => (d.id === id ? { ...d, done: !d.done } : d)));
  }

  function deleteDeadline(id) {
    setDeadlines((prev) => prev.filter((d) => d.id !== id));
  }

  const deadlinesSorted = useMemo(() => {
    return [...deadlines].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    });
  }, [deadlines]);

  const weekLabel = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  const dailyQuote = useMemo(() => pickDailyQuote(todayKey), [todayKey]);

  const weekKeys = days.map((d) => fmtKey(d));
  const weeklyTrainingStats = useMemo(() => {
    const inWeek = trainingEntries.filter((e) => weekKeys.includes(e.date));
    const sessions = inWeek.length;
    const minutes = inWeek.reduce((sum, e) => sum + (e.duration || 0), 0);
    const distance = inWeek.reduce((sum, e) => sum + (e.distance || 0), 0);
    return { sessions, minutes, distance };
  }, [trainingEntries, weekKeys.join("|")]);

  const sortedTrainingEntries = useMemo(
    () => [...trainingEntries].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8),
    [trainingEntries]
  );

  // Renders a single day's card (used for both the week grid and the "today only" view).
  function renderDayCard(d) {
    const key = fmtKey(d);
    const isToday = key === todayKey;
    const dayCategories = CATEGORIES.filter((cat) => cat.key !== "work" || !isWeekendDate(d));

    return (
      <div
        key={key}
        className="dp-day-card"
        style={{
          background: isToday ? theme.todayCardBg : theme.cardBg,
          color: isToday ? "#EFEAE1" : theme.text,
          border: isToday ? "3px solid #B5502F" : `2px solid ${theme.cardBorder}`,
          boxShadow: isToday ? "0 6px 0 0 #8A3A20" : "none",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "visible",
          transform: isToday ? "translateY(-2px)" : "none",
        }}
      >
        {isToday && (
          <div
            className="dp-mono"
            style={{
              position: "absolute",
              top: -10,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#B5502F",
              color: "#FFF6EE",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "3px 8px",
              borderRadius: 10,
              whiteSpace: "nowrap",
              zIndex: 2,
            }}
          >
            TODAY
          </div>
        )}

        <div
          style={{
            padding: "10px 12px",
            borderBottom: `2px solid ${isToday ? "#B5502F" : theme.cardBorder}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span className="dp-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", color: isToday ? "#F0A87E" : "inherit" }}>
            {fmtLabel(d)}
          </span>
        </div>

        {dayCategories.map((cat, idx, arr) => {
          const tasks = tasksForSection(key, cat.key);
          const openCount = tasks.filter((t) => !t.done).length;
          const carriedCount = tasks.filter((t) => t.carriedDays > 0).length;
          const draftKey = `${key}:${cat.key}`;
          const canAdd = key >= todayKey;

          return (
            <div
              key={cat.key}
              style={{
                borderBottom: idx < arr.length - 1 ? `1.5px dashed ${isToday ? "rgba(239,234,225,0.25)" : theme.hoverTint}` : "none",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ padding: "8px 10px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="dp-mono" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: cat.accent }}>
                  <cat.Icon size={11} />
                  {cat.label.toUpperCase()}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {carriedCount > 0 && (
                    <span className="dp-mono" title={`${carriedCount} carried over`} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9.5, fontWeight: 700, color: "#B5502F", background: isToday ? "#EFEAE1" : "#F4E3DC", padding: "1px 5px", borderRadius: 8 }}>
                      <Flame size={9} /> {carriedCount}
                    </span>
                  )}
                  {openCount > 0 && (
                    <span className="dp-mono" style={{ fontSize: 10, color: isToday ? "#EFEAE1" : "#5C5548", fontWeight: 600, opacity: 0.7 }}>
                      {openCount}
                    </span>
                  )}
                </span>
              </div>

              <div style={{ padding: "0 6px", display: "flex", flexDirection: "column", gap: 2, minHeight: 30 }}>
                {tasks.length === 0 && (
                  <div className="dp-mono" style={{ fontSize: 11, opacity: 0.4, padding: "4px 6px 8px", fontStyle: "italic" }}>
                    Nothing here
                  </div>
                )}
                {tasks.map((t) => {
                  const urgency = urgencyStyle(t.carriedDays);
                  return (
                    <div
                      key={t.id}
                      className={`dp-task-row${urgency && urgency.pulse ? " dp-urgent-pulse" : ""}`}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 6,
                        padding: "5px 6px",
                        borderRadius: 3,
                        border: urgency ? `1.5px solid ${urgency.border}` : "1.5px solid transparent",
                        background: urgency ? (isToday ? "rgba(181,80,47,0.14)" : "rgba(181,80,47,0.06)") : "transparent",
                      }}
                    >
                      <button
                        onClick={() => toggleTask(t.sourceDay, t.id)}
                        aria-label={t.done ? "Mark incomplete" : "Mark complete"}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          marginTop: 1,
                          color: t.done ? "#7A9E7E" : urgency ? "#B5502F" : isToday ? "#EFEAE1" : theme.text,
                          opacity: t.done ? 0.8 : urgency ? 1 : 0.6,
                          flexShrink: 0,
                        }}
                      >
                        {t.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, lineHeight: 1.35, textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.5 : 1, wordBreak: "break-word" }}>
                          {t.text}
                        </span>
                        {urgency && !t.done && (
                          <div style={{ marginTop: 3 }}>
                            <span className="dp-mono" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, letterSpacing: "0.03em", color: urgency.badgeColor, background: urgency.badgeBg, padding: "1px 5px", borderRadius: 8 }}>
                              {urgency.icon && <Flame size={8} />}
                              {t.carriedDays === 1 ? "CARRIED 1 DAY" : `CARRIED ${t.carriedDays} DAYS`}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteTask(t.sourceDay, t.id)}
                        aria-label="Delete task"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.35, color: isToday ? "#EFEAE1" : theme.text, flexShrink: 0 }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.35)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {canAdd && (
                <div style={{ padding: "6px 8px 10px" }}>
                  {addingFor === draftKey ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        autoFocus
                        className="dp-add-input"
                        value={draftText[draftKey] || ""}
                        onChange={(e) => setDraftText((prev) => ({ ...prev, [draftKey]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addTask(key, cat.key);
                          else if (e.key === "Escape") setAddingFor(null);
                        }}
                        onBlur={() => {
                          if (!(draftText[draftKey] || "").trim()) setAddingFor(null);
                        }}
                        placeholder={`Add ${cat.label.toLowerCase()} task…`}
                        style={{
                          flex: 1,
                          fontFamily: "inherit",
                          fontSize: 12.5,
                          padding: "5px 7px",
                          border: `1.5px solid ${isToday ? "#EFEAE1" : theme.cardBorder}`,
                          background: "transparent",
                          color: "inherit",
                          borderRadius: 2,
                        }}
                      />
                      <button
                        onClick={() => addTask(key, cat.key)}
                        className="dp-mono"
                        style={{ border: `1.5px solid ${isToday ? "#EFEAE1" : theme.cardBorder}`, background: "transparent", color: "inherit", cursor: "pointer", padding: "0 9px", fontSize: 11.5, fontWeight: 600 }}
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      className="dp-plus-btn"
                      onClick={() => setAddingFor(draftKey)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                        border: `1.5px dashed ${cat.accent}`,
                        background: "transparent",
                        color: cat.accent,
                        cursor: "pointer",
                        padding: "5px 0",
                        fontSize: 11.5,
                      }}
                    >
                      <Plus size={12} /> {cat.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "'Quicksand', sans-serif",
        background: theme.pageBg,
        minHeight: "100%",
        padding: "28px 20px 40px",
        color: theme.text,
        transition: "background 0.2s ease, color 0.2s ease",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Quicksand:wght@400;500;600;700&display=swap');
        .dp-mono { font-family: 'Fredoka', sans-serif; }
        body, h1, h2, h3 { font-family: 'Quicksand', sans-serif; }
        .dp-day-card { transition: box-shadow 0.15s ease, transform 0.15s ease, background 0.2s ease, color 0.2s ease; }
        .dp-task-row { transition: background 0.12s ease; }
        .dp-task-row:hover { background: ${theme.hoverTint}; }
        .dp-add-input:focus { outline: none; border-color: #B5502F; }
        .dp-nav-btn { transition: background 0.12s ease, color 0.12s ease; }
        .dp-nav-btn:hover { background: ${theme.text}; color: ${theme.pageBg}; }
        .dp-plus-btn:hover { filter: brightness(0.9); }
        .dp-trip-row:hover { background: rgba(59,110,140,0.12) !important; }
        .dp-quicklink:hover { filter: brightness(0.95); }
        .dp-mode-btn.active { background: ${theme.text}; color: ${theme.pageBg}; }
        .dp-theme-toggle:hover { filter: brightness(0.9); }
        @keyframes dp-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(181,80,47,0.5); }
          50% { box-shadow: 0 0 0 4px rgba(181,80,47,0); }
        }
        .dp-urgent-pulse { animation: dp-pulse 1.6s ease-in-out infinite; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: #C9BFAE; border-radius: 3px; }
      `}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* ===================== QUICK LINKS ===================== */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <button
            onClick={() => setDarkMode((v) => !v)}
            className="dp-theme-toggle"
            aria-label="Toggle dark mode"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: `1.5px solid ${theme.cardBorder}`,
              background: theme.cardBg,
              color: theme.text,
              borderRadius: 14,
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {darkMode ? <Sun size={12} /> : <Moon size={12} />}
          </button>
          <span className="dp-mono" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: theme.mutedText, marginRight: 4 }}>
            <Link2 size={12} /> QUICK LINKS
          </span>
          {quickLinks.map((l) => (
            <span
              key={l.id}
              className="dp-quicklink"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                border: `1.5px solid ${theme.cardBorder}`,
                background: theme.cardBg,
                borderRadius: 14,
                padding: "4px 6px 4px 10px",
              }}
            >
              <button
                onClick={() => openQuickLink(l.url)}
                className="dp-mono"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: theme.text, display: "flex", alignItems: "center", gap: 5, padding: 0 }}
              >
                <ExternalLink size={11} /> {l.label}
              </button>
              <button
                onClick={() => deleteQuickLink(l.id)}
                aria-label={`Remove ${l.label}`}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.3, color: theme.text, display: "flex" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.3)}
              >
                <X size={11} />
              </button>
            </span>
          ))}

          <button
            onClick={() => setShowNotesPanel((v) => !v)}
            className="dp-mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: "1.5px solid #C9A227",
              background: showNotesPanel ? "#C9A227" : "transparent",
              color: showNotesPanel ? "#2B2620" : "#8A7A1E",
              borderRadius: 14,
              padding: "4px 10px",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <StickyNote size={12} /> Notes{notes.length > 0 ? ` (${notes.length})` : ""}
          </button>

          {showAddLink ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1.5px solid #B5502F", borderRadius: 14, padding: "3px 6px", background: theme.cardBg }}>
              <input
                autoFocus
                value={linkDraft.label}
                onChange={(e) => setLinkDraft((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Name"
                style={{ width: 64, fontSize: 11, padding: "3px 6px", border: "1px solid #C9BFAE", borderRadius: 10, fontFamily: "inherit" }}
              />
              <input
                value={linkDraft.url}
                onChange={(e) => setLinkDraft((prev) => ({ ...prev, url: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addQuickLink()}
                placeholder="URL"
                style={{ width: 130, fontSize: 11, padding: "3px 6px", border: "1px solid #C9BFAE", borderRadius: 10, fontFamily: "inherit" }}
              />
              <button onClick={addQuickLink} className="dp-mono" style={{ border: "none", background: "#B5502F", color: "#FFF6EE", borderRadius: 10, padding: "3px 9px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>
                Add
              </button>
              <button onClick={() => setShowAddLink(false)} aria-label="Cancel" style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, padding: 2 }}>
                <X size={12} />
              </button>
            </span>
          ) : (
            <button
              onClick={() => setShowAddLink(true)}
              className="dp-mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                border: "1.5px dashed #8A8272",
                background: "transparent",
                color: "#8A8272",
                borderRadius: 14,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <Plus size={11} /> Add
            </button>
          )}
        </div>
        {quickLinksError && (
          <div className="dp-mono" style={{ background: "#F4E3DC", border: "1px solid #B5502F", color: "#8A3A20", padding: "6px 10px", fontSize: 11, marginBottom: 12 }}>
            {quickLinksError}
          </div>
        )}

        {showNotesPanel && (
          <div
            style={{
              background: theme.notesBg,
              border: "2px solid #C9A227",
              padding: 16,
              marginBottom: 18,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="dp-mono" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#8A7A1E" }}>
                <StickyNote size={14} /> NOTES
              </span>
              <button onClick={() => setShowNotesPanel(false)} aria-label="Close notes" style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, color: "#2B2620" }}>
                <X size={16} />
              </button>
            </div>

            {notesError && (
              <div className="dp-mono" style={{ background: "#F4E3DC", border: "1px solid #B5502F", color: "#8A3A20", padding: "6px 10px", fontSize: 11 }}>
                {notesError}
              </div>
            )}

            {/* Add note form */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                value={noteDraft.title}
                onChange={(e) => setNoteDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Title (optional) — e.g. a module code or topic"
                style={{ fontSize: 13, padding: "6px 9px", border: "1.5px solid #D9C77A", borderRadius: 3, fontFamily: "inherit", background: theme.inputBg, color: theme.text }}
              />
              <textarea
                value={noteDraft.text}
                onChange={(e) => setNoteDraft((prev) => ({ ...prev, text: e.target.value }))}
                placeholder="Jot something down…"
                rows={2}
                style={{ fontSize: 13, padding: "6px 9px", border: "1.5px solid #D9C77A", borderRadius: 3, fontFamily: "inherit", background: theme.inputBg, color: theme.text, resize: "vertical" }}
              />
              <button
                onClick={addNote}
                className="dp-mono"
                style={{ alignSelf: "flex-start", border: "none", background: "#C9A227", color: "#2B2620", cursor: "pointer", padding: "6px 14px", fontSize: 12, fontWeight: 700, borderRadius: 3 }}
              >
                Save Note
              </button>
            </div>

            {/* Notes list */}
            {notes.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginTop: 4 }}>
                {notes.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      background: theme.noteCardBg,
                      border: `1.5px solid ${theme.noteCardBorder}`,
                      borderRadius: 3,
                      padding: "8px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      position: "relative",
                    }}
                  >
                    <button
                      onClick={() => deleteNote(n.id)}
                      aria-label="Delete note"
                      style={{ position: "absolute", top: 5, right: 5, background: "none", border: "none", cursor: "pointer", opacity: 0.35, color: "#2B2620" }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.35)}
                    >
                      <Trash2 size={12} />
                    </button>
                    <span className="dp-mono" style={{ fontSize: 11, fontWeight: 700, paddingRight: 16 }}>{n.title}</span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== PLANNER (TOP) ===================== */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 22,
            borderBottom: `3px solid ${theme.cardBorder}`,
            paddingBottom: 16,
          }}
        >
          <div>
            <div className="dp-mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "#B5502F", fontWeight: 600, marginBottom: 4 }}>
              WEEK PLANNER
            </div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 400, letterSpacing: "-0.01em" }}>
              {viewMode === "week" ? weekLabel : fmtLabel(todayDateObj)}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Calendar / Today mode toggle */}
            <div style={{ display: "flex", border: `2px solid ${theme.cardBorder}` }}>
              <button
                className={`dp-mono dp-mode-btn${viewMode === "week" ? " active" : ""}`}
                onClick={() => setViewMode("week")}
                style={{
                  height: 36,
                  padding: "0 12px",
                  border: "none",
                  background: viewMode === "week" ? theme.text : "transparent",
                  color: viewMode === "week" ? theme.pageBg : theme.text,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.03em",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <CalendarDays size={14} /> Calendar
              </button>
              <button
                className={`dp-mono dp-mode-btn${viewMode === "today" ? " active" : ""}`}
                onClick={() => setViewMode("today")}
                style={{
                  height: 36,
                  padding: "0 12px",
                  border: "none",
                  borderLeft: `2px solid ${theme.cardBorder}`,
                  background: viewMode === "today" ? theme.text : "transparent",
                  color: viewMode === "today" ? theme.pageBg : theme.text,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.03em",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <ListChecks size={14} /> Today
              </button>
            </div>

            {viewMode === "week" && (
              <>
                <button className="dp-nav-btn" onClick={() => shiftWeek(-1)} aria-label="Previous week"
                  style={{ width: 36, height: 36, border: `2px solid ${theme.cardBorder}`, background: "transparent", borderRadius: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: theme.text }}>
                  <ChevronLeft size={18} />
                </button>
                <button className="dp-nav-btn" onClick={() => setWeekStart(startOfWeek(new Date()))}
                  style={{ height: 36, padding: "0 14px", border: `2px solid ${theme.cardBorder}`, background: "transparent", borderRadius: 0, cursor: "pointer", fontFamily: "'Fredoka', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", color: theme.text }}>
                  THIS WEEK
                </button>
                <button className="dp-nav-btn" onClick={() => shiftWeek(1)} aria-label="Next week"
                  style={{ width: 36, height: 36, border: `2px solid ${theme.cardBorder}`, background: "transparent", borderRadius: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: theme.text }}>
                  <ChevronRight size={18} />
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="dp-mono" style={{ background: "#F4E3DC", border: "1px solid #B5502F", color: "#8A3A20", padding: "8px 12px", fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {viewMode === "week" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8, paddingTop: 14, width: "100%" }}>
            {days.map((d) => renderDayCard(d))}
          </div>
        ) : (
          <div style={{ maxWidth: 420, margin: "0 auto", paddingTop: 14 }}>{renderDayCard(todayDateObj)}</div>
        )}

        <div className="dp-mono" style={{ marginTop: 18, fontSize: 13, opacity: 0.65, letterSpacing: "0.01em", fontStyle: "italic", textAlign: "center" }}>
          "{dailyQuote}"
        </div>

        {/* ===================== BOTTOM DASHBOARD ROW ===================== */}
        <div
          style={{
            marginTop: 32,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
          }}
        >
          {/* Bottom-left: Masters Deadline Tracker */}
          <div
            style={{
              background: theme.cardBg,
              border: `2px solid ${theme.cardBorder}`,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 220,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <span className="dp-mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em", color: "#8A5C99" }}>
                <GraduationCap size={15} /> DEADLINES
              </span>
              {deadlinesSorted.filter((d) => !d.done).length > 0 && (
                <span className="dp-mono" style={{ fontSize: 9.5, opacity: 0.5 }}>
                  {deadlinesSorted.filter((d) => !d.done).length} open
                </span>
              )}
            </div>

            {deadlinesError && (
              <div className="dp-mono" style={{ background: "#F4E3DC", border: "1px solid #B5502F", color: "#8A3A20", padding: "6px 10px", fontSize: 11 }}>
                {deadlinesError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 210, overflowY: "auto" }}>
              {deadlinesSorted.map((d) => {
                const daysLeft = daysBetween(todayKey, d.dueDate);
                let urgencyColor = "#5C8F6B"; // plenty of time
                let urgencyLabel = `${daysLeft}d left`;
                if (daysLeft < 0) {
                  urgencyColor = "#B5502F";
                  urgencyLabel = `${Math.abs(daysLeft)}d overdue`;
                } else if (daysLeft === 0) {
                  urgencyColor = "#B5502F";
                  urgencyLabel = "due today";
                } else if (daysLeft <= 3) {
                  urgencyColor = "#B5502F";
                } else if (daysLeft <= 7) {
                  urgencyColor = "#C9A227";
                }
                return (
                  <div
                    key={d.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 6,
                      padding: "6px 8px",
                      borderRadius: 3,
                      background: !d.done && daysLeft <= 3 ? "rgba(181,80,47,0.08)" : "transparent",
                      opacity: d.done ? 0.45 : 1,
                    }}
                  >
                    <button
                      onClick={() => toggleDeadlineDone(d.id)}
                      aria-label={d.done ? "Mark not done" : "Mark done"}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 1, color: d.done ? "#7A9E7E" : theme.mutedText, flexShrink: 0 }}
                    >
                      {d.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, textDecoration: d.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.title}
                      </div>
                      <div className="dp-mono" style={{ fontSize: 10, display: "flex", gap: 6, alignItems: "center" }}>
                        {d.module && <span style={{ opacity: 0.5 }}>{d.module}</span>}
                        {!d.done && (
                          <span style={{ color: urgencyColor, fontWeight: 700 }}>{urgencyLabel}</span>
                        )}
                        <span style={{ opacity: 0.4 }}>
                          {new Date(d.dueDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteDeadline(d.id)}
                      aria-label="Delete deadline"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.3, color: theme.text, flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.3)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
              {deadlinesSorted.length === 0 && (
                <div className="dp-mono" style={{ fontSize: 11.5, opacity: 0.45, fontStyle: "italic", padding: "4px 2px" }}>
                  No deadlines yet — add one below.
                </div>
              )}
            </div>

            {showAddDeadline ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <input
                  autoFocus
                  value={deadlineDraft.title}
                  onChange={(e) => setDeadlineDraft((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Assignment / task title"
                  style={{ fontSize: 12, padding: "5px 7px", border: `1.5px solid ${theme.cardBorder}`, borderRadius: 2, fontFamily: "inherit", background: theme.inputBg, color: theme.text }}
                />
                <div style={{ display: "flex", gap: 5 }}>
                  <input
                    value={deadlineDraft.module}
                    onChange={(e) => setDeadlineDraft((prev) => ({ ...prev, module: e.target.value }))}
                    placeholder="Module (optional)"
                    style={{ flex: 1, fontSize: 12, padding: "5px 7px", border: `1.5px solid ${theme.cardBorder}`, borderRadius: 2, fontFamily: "inherit", background: theme.inputBg, color: theme.text }}
                  />
                  <input
                    type="date"
                    value={deadlineDraft.dueDate}
                    onChange={(e) => setDeadlineDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                    style={{ fontSize: 12, padding: "5px 7px", border: `1.5px solid ${theme.cardBorder}`, borderRadius: 2, fontFamily: "inherit", background: theme.inputBg, color: theme.text }}
                  />
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={addDeadline} className="dp-mono" style={{ border: "1.5px solid #8A5C99", background: "#8A5C99", color: "#FFF6EE", cursor: "pointer", padding: "5px 12px", fontSize: 11.5, fontWeight: 700, borderRadius: 2 }}>
                    Add
                  </button>
                  <button onClick={() => setShowAddDeadline(false)} aria-label="Cancel" style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddDeadline(true)}
                className="dp-mono"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, border: "1.5px dashed #8A5C99", background: "transparent", color: "#8A5C99", cursor: "pointer", padding: "6px 0", fontSize: 11.5, borderRadius: 2 }}
              >
                <Plus size={12} /> Add deadline
              </button>
            )}
          </div>

          {/* Bottom-middle: Trip Scanner watchlist */}
          <div
            style={{
              background: theme.cardBg,
              border: `2px solid ${theme.cardBorder}`,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 220,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <span className="dp-mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em", color: "#3B6E8C" }}>
                <Plane size={15} /> TRIP SCANNER
              </span>
              <span className="dp-mono" style={{ fontSize: 9.5, opacity: 0.5, textAlign: "right" }}>
                SIN → worldwide · Oct–Dec · 5+ days · under ${TRIP_BUDGET_CAP}
              </span>
            </div>

            {tripError && (
              <div className="dp-mono" style={{ background: "#F4E3DC", border: "1px solid #B5502F", color: "#8A3A20", padding: "6px 10px", fontSize: 11 }}>
                {tripError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 210, overflowY: "auto" }}>
              {destinationsSorted.map((d) => {
                const underBudget = d.bestPrice !== null && d.bestPrice <= TRIP_BUDGET_CAP;
                const overBudget = d.bestPrice !== null && d.bestPrice > TRIP_BUDGET_CAP;
                return (
                  <div
                    key={d.id}
                    onClick={() => setSelectedDestId(d.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedDestId(d.id)}
                    className="dp-trip-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "7px 9px",
                      borderRadius: 3,
                      background: underBudget ? "rgba(59,110,140,0.08)" : "transparent",
                      border: underBudget ? "1.5px solid #3B6E8C" : "1.5px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {d.name} <span style={{ opacity: 0.5, fontWeight: 400, fontSize: 11.5 }}>· {d.country}</span>
                      </div>
                      <div className="dp-mono" style={{ fontSize: 10, opacity: 0.5 }}>
                        {d.logs.length} {d.logs.length === 1 ? "check" : "checks"} logged
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {d.bestPrice !== null ? (
                        <span
                          className="dp-mono"
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: underBudget ? "#3B6E8C" : "#B5502F",
                          }}
                        >
                          ${d.bestPrice}
                        </span>
                      ) : (
                        <span className="dp-mono" style={{ fontSize: 10.5, opacity: 0.4, fontStyle: "italic" }}>
                          no data
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {destinationsSorted.length === 0 && (
                <div className="dp-mono" style={{ fontSize: 11.5, opacity: 0.45, fontStyle: "italic", padding: "4px 2px" }}>
                  No destinations yet — add one below.
                </div>
              )}
            </div>

            {showAddDestination ? (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <input
                  autoFocus
                  value={destDraft.name}
                  onChange={(e) => setDestDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="City"
                  style={{ flex: 1, minWidth: 80, fontSize: 12, padding: "5px 7px", border: "1.5px solid #2B2620", borderRadius: 2, fontFamily: "inherit" }}
                />
                <input
                  value={destDraft.country}
                  onChange={(e) => setDestDraft((prev) => ({ ...prev, country: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addDestination()}
                  placeholder="Country"
                  style={{ width: 90, fontSize: 12, padding: "5px 7px", border: "1.5px solid #2B2620", borderRadius: 2, fontFamily: "inherit" }}
                />
                <button onClick={addDestination} className="dp-mono" style={{ border: "1.5px solid #3B6E8C", background: "#3B6E8C", color: "#FFF6EE", cursor: "pointer", padding: "0 10px", fontSize: 11.5, fontWeight: 700, borderRadius: 2 }}>
                  Add
                </button>
                <button onClick={() => setShowAddDestination(false)} aria-label="Cancel" style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddDestination(true)}
                className="dp-mono"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, border: "1.5px dashed #3B6E8C", background: "transparent", color: "#3B6E8C", cursor: "pointer", padding: "6px 0", fontSize: 11.5, borderRadius: 2 }}
              >
                <Plus size={12} /> Add destination to watch
              </button>
            )}

            <p className="dp-mono" style={{ margin: 0, fontSize: 9.5, opacity: 0.4, lineHeight: 1.4 }}>
              Click a destination to log a new price check or see its history. This won't scan automatically — log prices you find yourself whenever you check.
            </p>
          </div>

          {/* Bottom-right: Training Tracker */}
          <div
            style={{
              background: "#2B2620",
              color: "#EFEAE1",
              border: "2px solid #2B2620",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 220,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="dp-mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: "#3E9CAB" }}>
                <Dumbbell size={16} /> TRAINING TRACKER
              </span>
              <span className="dp-mono" style={{ fontSize: 10.5, opacity: 0.75 }}>
                {weeklyTrainingStats.sessions} sessions · {weeklyTrainingStats.distance.toFixed(1)} km · {weeklyTrainingStats.minutes}m this week
              </span>
            </div>

            {trainingError && (
              <div className="dp-mono" style={{ background: "#4A241A", color: "#F4E3DC", padding: "6px 10px", fontSize: 11 }}>
                {trainingError}
              </div>
            )}

            {/* Add entry form */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {TRAINING_TYPES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTrainingDraft((prev) => ({ ...prev, type: t.key }))}
                    className="dp-mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 12,
                      border: `1.5px solid ${t.accent}`,
                      background: trainingDraft.type === t.key ? t.accent : "transparent",
                      color: trainingDraft.type === t.key ? "#111" : t.accent,
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="date"
                  value={trainingDraft.date}
                  onChange={(e) => setTrainingDraft((prev) => ({ ...prev, date: e.target.value }))}
                  style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "5px 6px", border: "1.5px solid #4A4438", background: "#33291F", color: "#EFEAE1", borderRadius: 2, fontFamily: "inherit" }}
                />
                <input
                  type="number"
                  min="0"
                  placeholder="min"
                  value={trainingDraft.duration}
                  onChange={(e) => setTrainingDraft((prev) => ({ ...prev, duration: e.target.value }))}
                  style={{ width: 60, fontSize: 12, padding: "5px 6px", border: "1.5px solid #4A4438", background: "#33291F", color: "#EFEAE1", borderRadius: 2, fontFamily: "inherit" }}
                />
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="km"
                  value={trainingDraft.distance}
                  onChange={(e) => setTrainingDraft((prev) => ({ ...prev, distance: e.target.value }))}
                  style={{ width: 60, fontSize: 12, padding: "5px 6px", border: "1.5px solid #4A4438", background: "#33291F", color: "#EFEAE1", borderRadius: 2, fontFamily: "inherit" }}
                />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={trainingDraft.notes}
                  onChange={(e) => setTrainingDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addTrainingEntry()}
                  style={{ flex: 1, fontSize: 12, padding: "5px 7px", border: "1.5px solid #4A4438", background: "#33291F", color: "#EFEAE1", borderRadius: 2, fontFamily: "inherit" }}
                />
                <button
                  onClick={addTrainingEntry}
                  className="dp-mono"
                  style={{ border: "1.5px solid #3E9CAB", background: "#3E9CAB", color: "#0F1F21", cursor: "pointer", padding: "0 12px", fontSize: 11.5, fontWeight: 700, borderRadius: 2 }}
                >
                  Log
                </button>
              </div>
            </div>

            {/* Entry list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: 160 }}>
              {sortedTrainingEntries.length === 0 && (
                <div className="dp-mono" style={{ fontSize: 11.5, opacity: 0.5, fontStyle: "italic", padding: "4px 2px" }}>
                  No sessions logged yet
                </div>
              )}
              {sortedTrainingEntries.map((e) => {
                const typeInfo = TRAINING_TYPES.find((t) => t.key === e.type) || TRAINING_TYPES[2];
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 3, background: "rgba(255,255,255,0.04)" }}>
                    <span className="dp-mono" style={{ fontSize: 9.5, fontWeight: 700, color: typeInfo.accent, border: `1px solid ${typeInfo.accent}`, borderRadius: 8, padding: "1px 6px", flexShrink: 0 }}>
                      {typeInfo.label}
                    </span>
                    <span className="dp-mono" style={{ fontSize: 10.5, opacity: 0.7, flexShrink: 0 }}>
                      {new Date(e.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.duration}m{e.distance ? ` · ${e.distance}km` : ""}{e.notes ? ` — ${e.notes}` : ""}
                    </span>
                    <button
                      onClick={() => deleteTrainingEntry(e.id)}
                      aria-label="Delete entry"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.4, color: "#EFEAE1", flexShrink: 0 }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.opacity = 1)}
                      onMouseLeave={(ev) => (ev.currentTarget.style.opacity = 0.4)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedDestId && (() => {
        const dest = tripDestinations.find((d) => d.id === selectedDestId);
        if (!dest) return null;
        const logs = [...tripPriceLogs.filter((l) => l.destId === selectedDestId)].sort((a, b) => (a.dateChecked < b.dateChecked ? -1 : 1));
        const logsDesc = [...logs].reverse();
        const bestPrice = logs.length ? Math.min(...logs.map((l) => l.price)) : null;
        const formSpan = computeTripSpan(logDraft.tripStart, logDraft.tripEnd);

        // Simple sparkline
        const sparkW = 280;
        const sparkH = 54;
        let sparkline = null;
        if (logs.length >= 1) {
          const prices = logs.map((l) => l.price);
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          const range = max - min || 1;
          const points = logs.map((l, i) => {
            const x = logs.length === 1 ? sparkW / 2 : (i / (logs.length - 1)) * (sparkW - 12) + 6;
            const y = sparkH - 8 - ((l.price - min) / range) * (sparkH - 16);
            return { x, y, price: l.price };
          });
          const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          sparkline = (
            <svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" style={{ display: "block" }}>
              <line x1="0" y1={sparkH - 8} x2={sparkW} y2={sparkH - 8} stroke="#E0D5C4" strokeWidth="1" />
              <path d={pathD} fill="none" stroke="#3B6E8C" strokeWidth="2" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={p.price === bestPrice ? 4 : 2.5} fill={p.price === bestPrice ? "#3B6E8C" : "#8FA9BB"} />
              ))}
            </svg>
          );
        }

        return (
          <div
            onClick={() => setSelectedDestId(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(43,38,32,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: theme.cardBg,
                color: theme.text,
                border: `3px solid ${theme.cardBorder}`,
                boxShadow: `0 8px 0 0 ${theme.cardBorder}`,
                maxWidth: 460,
                width: "100%",
                maxHeight: "85vh",
                overflowY: "auto",
                padding: 22,
                position: "relative",
              }}
            >
              <button
                onClick={() => setSelectedDestId(null)}
                aria-label="Close"
                style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", opacity: 0.5, color: "#2B2620" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.5)}
              >
                <X size={20} />
              </button>

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div className="dp-mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "#3B6E8C", fontWeight: 700, marginBottom: 6 }}>
                    {(dest.country || "").toUpperCase()}
                  </div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 600, paddingRight: 20 }}>{dest.name}</h2>
                </div>
                <button
                  onClick={() => deleteDestination(dest.id)}
                  className="dp-mono"
                  style={{ display: "flex", alignItems: "center", gap: 4, border: "1.5px solid #B5502F", color: "#B5502F", background: "transparent", cursor: "pointer", padding: "4px 8px", fontSize: 10, borderRadius: 2, marginTop: 4, flexShrink: 0 }}
                >
                  <Trash2 size={11} /> Remove
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
                {bestPrice !== null ? (
                  <span className="dp-mono" style={{ fontSize: 22, fontWeight: 700, color: bestPrice <= TRIP_BUDGET_CAP ? "#3B6E8C" : "#B5502F" }}>
                    ${bestPrice}
                  </span>
                ) : (
                  <span className="dp-mono" style={{ fontSize: 14, opacity: 0.5, fontStyle: "italic" }}>
                    No prices logged yet
                  </span>
                )}
                {bestPrice !== null && (
                  <span className="dp-mono" style={{ fontSize: 9.5, fontWeight: 700, color: bestPrice <= TRIP_BUDGET_CAP ? "#FFF6EE" : "#FFF6EE", background: bestPrice <= TRIP_BUDGET_CAP ? "#3B6E8C" : "#B5502F", padding: "2px 8px", borderRadius: 8 }}>
                    {bestPrice <= TRIP_BUDGET_CAP ? "UNDER BUDGET" : "OVER BUDGET"}
                  </span>
                )}
              </div>

              {sparkline && (
                <div style={{ marginBottom: 14, background: "rgba(59,110,140,0.06)", borderRadius: 3, padding: "8px 10px" }}>
                  {sparkline}
                  <div className="dp-mono" style={{ fontSize: 9, opacity: 0.5, textAlign: "center", marginTop: 2 }}>
                    Price history · {logs.length} check{logs.length === 1 ? "" : "s"}
                  </div>
                </div>
              )}

              {/* Add price log form */}
              <div style={{ background: "rgba(43,38,32,0.04)", borderRadius: 3, padding: 12, marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="dp-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", opacity: 0.55 }}>
                  LOG A PRICE CHECK
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input
                    type="number"
                    min="0"
                    placeholder="Price ($)"
                    value={logDraft.price}
                    onChange={(e) => setLogDraft((prev) => ({ ...prev, price: e.target.value }))}
                    style={{ width: 90, fontSize: 12.5, padding: "6px 8px", border: "1.5px solid #2B2620", borderRadius: 2, fontFamily: "inherit" }}
                  />
                  <input
                    type="date"
                    value={logDraft.dateChecked || todayKey}
                    onChange={(e) => setLogDraft((prev) => ({ ...prev, dateChecked: e.target.value }))}
                    style={{ flex: 1, minWidth: 130, fontSize: 12.5, padding: "6px 8px", border: "1.5px solid #2B2620", borderRadius: 2, fontFamily: "inherit" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <label className="dp-mono" style={{ fontSize: 10, opacity: 0.55 }}>Depart</label>
                  <input
                    type="date"
                    value={logDraft.tripStart}
                    onChange={(e) => setLogDraft((prev) => ({ ...prev, tripStart: e.target.value }))}
                    style={{ fontSize: 12.5, padding: "6px 8px", border: "1.5px solid #2B2620", borderRadius: 2, fontFamily: "inherit" }}
                  />
                  <label className="dp-mono" style={{ fontSize: 10, opacity: 0.55 }}>Return</label>
                  <input
                    type="date"
                    value={logDraft.tripEnd}
                    onChange={(e) => setLogDraft((prev) => ({ ...prev, tripEnd: e.target.value }))}
                    style={{ fontSize: 12.5, padding: "6px 8px", border: "1.5px solid #2B2620", borderRadius: 2, fontFamily: "inherit" }}
                  />
                </div>
                {formSpan && (
                  <div className="dp-mono" style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 6, color: formSpan.days >= 5 ? "#3B6E8C" : "#B5502F" }}>
                    {formSpan.days} day{formSpan.days === 1 ? "" : "s"} {formSpan.days < 5 && "· under 5-day target"} {formSpan.hasWeekend && "· includes a weekend ✓"}
                  </div>
                )}
                <input
                  value={logDraft.airlines}
                  onChange={(e) => setLogDraft((prev) => ({ ...prev, airlines: e.target.value }))}
                  placeholder="Airline(s) — can mix carriers for the cheapest combo"
                  style={{ fontSize: 12.5, padding: "6px 8px", border: "1.5px solid #2B2620", borderRadius: 2, fontFamily: "inherit" }}
                />
                <input
                  value={logDraft.notes}
                  onChange={(e) => setLogDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addPriceLog(dest.id)}
                  placeholder="Notes (optional)"
                  style={{ fontSize: 12.5, padding: "6px 8px", border: "1.5px solid #2B2620", borderRadius: 2, fontFamily: "inherit" }}
                />
                <button
                  onClick={() => addPriceLog(dest.id)}
                  className="dp-mono"
                  style={{ alignSelf: "flex-start", border: "none", background: "#3B6E8C", color: "#FFF6EE", cursor: "pointer", padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: 2 }}
                >
                  Log Price
                </button>
              </div>

              {/* History list */}
              <div>
                <div className="dp-mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", opacity: 0.55, marginBottom: 6 }}>
                  HISTORY
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {logsDesc.length === 0 && (
                    <div className="dp-mono" style={{ fontSize: 11.5, opacity: 0.45, fontStyle: "italic" }}>
                      No checks logged yet.
                    </div>
                  )}
                  {logsDesc.map((l) => {
                    const span = computeTripSpan(l.tripStart, l.tripEnd);
                    return (
                      <div key={l.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "7px 9px", background: "rgba(43,38,32,0.04)", borderRadius: 3, position: "relative" }}>
                        <button
                          onClick={() => deletePriceLog(l.id)}
                          aria-label="Delete entry"
                          style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", cursor: "pointer", opacity: 0.35 }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.35)}
                        >
                          <X size={12} />
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 18 }}>
                          <span className="dp-mono" style={{ fontSize: 13.5, fontWeight: 700, color: l.price <= TRIP_BUDGET_CAP ? "#3B6E8C" : "#B5502F" }}>${l.price}</span>
                          <span className="dp-mono" style={{ fontSize: 9.5, opacity: 0.5 }}>
                            checked {new Date(l.dateChecked + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          {new Date(l.tripStart + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {new Date(l.tripEnd + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          {span && (
                            <span className="dp-mono" style={{ fontSize: 9.5, marginLeft: 6, opacity: 0.6 }}>
                              ({span.days}d{span.hasWeekend ? " · weekend" : ""})
                            </span>
                          )}
                        </div>
                        {l.airlines && <div style={{ fontSize: 11.5, opacity: 0.65 }}>{l.airlines}</div>}
                        {l.notes && <div style={{ fontSize: 11, opacity: 0.5, fontStyle: "italic" }}>{l.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
