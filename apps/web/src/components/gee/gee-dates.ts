// Sensor availability used by the original Backend script; the API derives the same periods.
export const LANDSAT5_FROM = "1984-03-16";
export const LANDSAT5_END = "2012-05-06";
export const LANDSAT8_FROM = "2013-03-18";

export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function shiftDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "2024-12" -> "2025-01"
export function nextMonth(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, index!, 1)).toISOString().slice(0, 7);
}
