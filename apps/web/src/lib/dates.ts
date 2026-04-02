/**
 * Returns the ISO date string (YYYY-MM-DD) for the Monday of the current week.
 * This is the canonical "week_of" date used throughout the app.
 */
export function getMondayOfCurrentWeek(): string {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Shift to Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().split("T")[0];
}
