import type { Grain } from "@/features/dashboard/queries";

/**
 * Bucket-width helpers, in a plain module on purpose.
 *
 * These used to live in GrainPicker.tsx, which carries "use client".
 * Anything exported from a client module is a client reference, so a
 * server page calling defaultGrain() got "Attempted to call
 * defaultGrain() from the server" — a runtime error with no compile-time
 * warning, because the types are identical either way.
 *
 * Both server pages and the client picker import from here instead.
 */

export function spanDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * The grain a range implies, when nobody has chosen one.
 *
 * Roughly 7–30 bars is what a chart this size can carry: fewer and it is
 * a table with extra steps, more and the bars are too thin to compare.
 */
export function defaultGrain(from: string, to: string): Grain {
  const days = spanDays(from, to);
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 800) return "month";
  return "year";
}
