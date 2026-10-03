import { createHash } from "node:crypto";

export const REFERRAL_DISCOUNT_RATE = 0.30;
export const REFERRAL_FREE_REFERRAL_MILESTONE = 150;
export const REFERRAL_FREE_MONTHS = 12;

export function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function referralCodeHash(value: string): string {
  return createHash("sha256").update(normalizeReferralCode(value)).digest("hex");
}

function timezoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])) as { year: number; month: number; day: number };
}

function zonedMidnight(year: number, month: number, timeZone: string): Date {
  let guess = Date.UTC(year, month - 1, 1);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = timezoneParts(new Date(guess), timeZone);
    guess += Date.UTC(year, month - 1, 1) - Date.UTC(actual.year, actual.month - 1, actual.day);
  }
  return new Date(guess);
}

export function referralPeriodForDate(timeZone: string | null | undefined, now = new Date()) {
  const zone = timeZone || "UTC";
  const current = timezoneParts(now, zone);
  const validFrom = zonedMidnight(current.year, current.month, zone);
  const nextYear = current.month === 12 ? current.year + 1 : current.year;
  const nextMonth = current.month === 12 ? 1 : current.month + 1;
  const validUntil = zonedMidnight(nextYear, nextMonth, zone);
  return { periodKey: `${current.year}-${String(current.month).padStart(2, "0")}`, validFrom, validUntil };
}

export function calculateReferralDiscountMinor(grossAmountMinor: number): number {
  const gross = Math.max(0, Math.round(grossAmountMinor));
  return Math.min(gross, Math.round(gross * REFERRAL_DISCOUNT_RATE));
}
