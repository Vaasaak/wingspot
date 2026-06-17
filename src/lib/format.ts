// Pomocné funkce na hezké zobrazení čísel, časů a datumů (česky).

const WEEKDAYS = ["ne", "po", "út", "st", "čt", "pá", "so"];
const WEEKDAYS_LONG = [
  "Neděle",
  "Pondělí",
  "Úterý",
  "Středa",
  "Čtvrtek",
  "Pátek",
  "Sobota",
];

function dateFromStr(date: string): Date {
  // poledne, aby nehrozil posun přes půlnoc kvůli časové zóně
  return new Date(date + "T12:00:00");
}

export function fmtWeekdayShort(date: string): string {
  return WEEKDAYS[dateFromStr(date).getDay()];
}

export function fmtWeekdayLong(date: string): string {
  return WEEKDAYS_LONG[dateFromStr(date).getDay()];
}

export function fmtDayMonth(date: string): string {
  const d = dateFromStr(date);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

export function isToday(date: string): boolean {
  const now = new Date();
  const d = dateFromStr(date);
  return (
    now.getFullYear() === d.getFullYear() &&
    now.getMonth() === d.getMonth() &&
    now.getDate() === d.getDate()
  );
}

export function fmtMs(n: number): string {
  return `${n.toFixed(1)} m/s`;
}

export function fmtWindow(start: number | null, end: number | null): string {
  if (start === null || end === null) return "–";
  return `${start}–${end} h`;
}

export function fmtClock(isoTime: string): string {
  // "2026-06-16T20:43" -> "20:43"
  return isoTime.slice(11, 16);
}
