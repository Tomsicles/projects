// Seed constants copied verbatim from ../../planner_dashboard.jsx (L36-68).
// Used only on first boot, when the corresponding tables are empty.

export const DEFAULT_QUICK_LINKS = [
  { id: "gmail", label: "Gmail", url: "https://mail.google.com" },
  { id: "outlook", label: "Outlook", url: "https://outlook.office.com/mail/" },
  { id: "canvas", label: "NUS Canvas", url: "https://canvas.nus.edu.sg" },
  { id: "gcal", label: "Calendar", url: "https://calendar.google.com" },
  { id: "strava", label: "Strava", url: "https://www.strava.com/dashboard" },
  { id: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com" },
];

export const SEED_TRIP_DESTINATIONS = [
  { id: "hcmc", name: "Ho Chi Minh City", country: "Vietnam" },
  { id: "hanoi", name: "Hanoi", country: "Vietnam" },
  { id: "vientiane", name: "Vientiane", country: "Laos" },
  { id: "luangprabang", name: "Luang Prabang", country: "Laos" },
  { id: "phuket", name: "Phuket", country: "Thailand" },
  { id: "kualalumpur", name: "Kuala Lumpur", country: "Malaysia" },
  { id: "taipei", name: "Taipei", country: "Taiwan" },
];

export const SEED_TRIP_LOGS = [
  { id: "seed1", destId: "hcmc", price: 150, dateChecked: "2026-07-03", tripStart: "2026-10-08", tripEnd: "2026-10-13", airlines: "Scoot", notes: "Cheapest overall, non-stop 2h05m" },
  { id: "seed2", destId: "hanoi", price: 190, dateChecked: "2026-07-03", tripStart: "2026-10-08", tripEnd: "2026-10-13", airlines: "Scoot / Vietnam Airlines", notes: "Most weekly flights in October" },
  { id: "seed3", destId: "vientiane", price: 280, dateChecked: "2026-07-03", tripStart: "2026-10-02", tripEnd: "2026-10-08", airlines: "Scoot / VietJet", notes: "Oct is actually the priciest month here" },
  { id: "seed4", destId: "luangprabang", price: 228, dateChecked: "2026-07-03", tripStart: "2026-10-08", tripEnd: "2026-10-13", airlines: "Vietnam Airlines", notes: "One-way fare, 1-stop only — no direct flights" },
  { id: "seed5", destId: "phuket", price: 236, dateChecked: "2026-07-06", tripStart: "2026-11-05", tripEnd: "2026-11-10", airlines: "Scoot / AirAsia", notes: "Skyscanner 2026 cheapest-destinations pick" },
  { id: "seed6", destId: "kualalumpur", price: 130, dateChecked: "2026-07-06", tripStart: "2026-10-15", tripEnd: "2026-10-20", airlines: "Scoot / AirAsia / Malaysia Airlines", notes: "Consistently the cheapest short-haul route from SIN" },
  { id: "seed7", destId: "taipei", price: 408, dateChecked: "2026-07-06", tripStart: "2026-11-12", tripEnd: "2026-11-18", airlines: "Scoot / China Airlines", notes: "Just over budget — worth watching for a dip" },
];
