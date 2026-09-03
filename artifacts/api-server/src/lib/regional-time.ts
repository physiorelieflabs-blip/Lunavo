const FALLBACK_TIMEZONE = "UTC";

export function safeTimeZone(value: string | null | undefined): string {
  if (!value) return FALLBACK_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

function dateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function localDateKey(value: Date, timeZone = FALLBACK_TIMEZONE): string {
  const parts = dateParts(value, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function calendarDaysSince(start: Date, now = new Date(), timeZone = FALLBACK_TIMEZONE): number {
  const startParts = dateParts(start, timeZone);
  const nowParts = dateParts(now, timeZone);
  const startUtc = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const nowUtc = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);
  return Math.max(0, Math.floor((nowUtc - startUtc) / 86_400_000));
}