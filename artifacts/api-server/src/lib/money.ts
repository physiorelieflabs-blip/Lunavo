/**
 * Exact monetary conversion boundary.
 *
 * Authoritative financial records use integer minor units. Decimal database/provider
 * values are parsed as decimal text and rounded explicitly with half-up semantics,
 * never by JavaScript floating-point multiplication.
 */
export function toMinorUnits(value: unknown, minorDigits = 2): number | null {
  if (!Number.isInteger(minorDigits) || minorDigits < 0 || minorDigits > 6) return null;

  const raw = typeof value === "string"
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? value.toString()
      : "";

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;

  const negative = raw.startsWith("-");
  const unsigned = raw.replace(/^[+-]/, "");
  const [wholeText, fractionText = ""] = unsigned.split(".");
  const whole = BigInt(wholeText);
  let fraction = fractionText.padEnd(minorDigits, "0").slice(0, minorDigits);
  let rounded = fractionText.length > minorDigits && Number(fractionText[minorDigits]) >= 5;

  let minor = whole * (10n ** BigInt(minorDigits));
  if (minorDigits > 0 && fraction) minor += BigInt(fraction);

  if (rounded) minor += 1n;

  const signed = negative ? -minor : minor;
  const numeric = Number(signed);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

export function multiplyMinorUnits(unitMinor: number, quantity: number): number | null {
  if (!Number.isSafeInteger(unitMinor) || !Number.isSafeInteger(quantity) || quantity < 0) return null;
  const result = BigInt(unitMinor) * BigInt(quantity);
  const numeric = Number(result);
  return Number.isSafeInteger(numeric) ? numeric : null;
}
