import { APP } from "@/config/app";

/**
 * Calendar dates in STORE time.
 *
 * The codebase reached for `new Date().toISOString().slice(0, 10)` in 35
 * places, and every one of them is wrong by a day for part of the day.
 * toISOString() converts to UTC first:
 *
 *   new Date(2026, 7, 1)          -> 2026-08-01 00:00 IST
 *                                 -> 2026-07-31 18:30 UTC
 *   .toISOString().slice(0,10)    -> "2026-07-31"
 *
 * So "this month" started on the last day of LAST month, every time, on
 * every screen that used it — the profit and loss page has been counting
 * an extra day of July into August. And `todayIso` was yesterday between
 * midnight and 05:30 IST, which is exactly when the owner works.
 *
 * Vercel runs the server in UTC and the owner's browser runs in US
 * Pacific, so neither "local time" is the shop's. en-CA is used only
 * because it formats as YYYY-MM-DD; the timeZone is what matters.
 */

const ISO = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: APP.timeZone,
});


/** The repo runs with noUncheckedIndexedAccess, so a split() element is
 *  `string | undefined`. Parsing once here keeps that noise out of every
 *  function below. */
function parts(iso: string): { y: number; m: number; d: number } {
  const [y = "0", m = "0", d = "0"] = iso.split("-");
  return { y: Number(y), m: Number(m), d: Number(d) };
}

/** A Date as its calendar date in store time, YYYY-MM-DD. */
export function isoOf(d: Date): string {
  return ISO.format(d);
}

/** Today's date in the shops, wherever this code happens to be running. */
export function todayIso(): string {
  return isoOf(new Date());
}

/** Shifts a YYYY-MM-DD by whole days without going near a timezone.
 *  Built at UTC noon so a DST or offset shift cannot roll the date. */
export function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** First day of the month containing `iso`. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Last day of the month containing `iso`. */
export function monthEnd(iso: string): string {
  const { y, m } = parts(iso);
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
}

/** First day of the previous month, and its last day. */
export function lastMonth(iso: string): [string, string] {
  const prev = addDays(monthStart(iso), -1);
  return [monthStart(prev), monthEnd(prev)];
}

/** Indian financial year containing `iso`: 1 April to 31 March. */
export function financialYear(iso: string): [string, string] {
  const { y, m } = parts(iso);
  const startYear = m >= 4 ? y : y - 1;
  return [`${startYear}-04-01`, `${startYear + 1}-03-31`];
}

/**
 * A real calendar date, not just the right shape.
 *
 * The old guard was /^\d{4}-\d{2}-\d{2}$/, which accepts 2026-13-45 and
 * hands it to Postgres to reject — a 500 on the page rather than a
 * fallback. It also accepts year 0002, which a date input genuinely
 * produces while you are still typing the year, and which asks the
 * database for two millennia of ledger in one go.
 */
export function isValidIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const { y, m, d } = parts(v);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

/** Nothing in this business predates the shop. A date below this is a
 *  half-typed year, not a query anyone meant to run. */
export const EARLIEST_DATE = "2015-01-01";

export interface DateRange {
  from: string;
  to: string;
  /** Set when the requested range was not usable and had to be changed,
   *  so the page can say so instead of silently reporting on a period
   *  nobody asked for. */
  adjusted: string | null;
}

/**
 * Turns whatever arrived in the query string into a range worth running.
 *
 * Everything here exists because a native date input emits a value on
 * every segment you edit. Typing "2026" produces 0002, 0020, 0202 and
 * then 2026, and the first three are valid dates that ask for the whole
 * ledger. Clamping them costs nothing and is the difference between a
 * 90ms query and a 1.5 second one repeated four times.
 */
export function parseDateRange(
  rawFrom: unknown,
  rawTo: unknown,
  fallback: { from: string; to: string },
  opts: { maxDays?: number } = {},
): DateRange {
  const today = todayIso();
  let adjusted: string | null = null;

  let from = isValidIsoDate(rawFrom) ? rawFrom : fallback.from;
  let to = isValidIsoDate(rawTo) ? rawTo : fallback.to;

  if (from < EARLIEST_DATE) {
    from = fallback.from;
    adjusted = "That start date is before the business existed, so the default period is shown.";
  }

  // A future end date is harmless; a future START silently reports zero
  // and looks like missing data.
  if (from > today) {
    from = fallback.from;
    adjusted = "That start date is in the future, so the default period is shown.";
  }

  if (from > to) {
    [from, to] = [to, from];
    adjusted = "The dates were the wrong way round, so they have been swapped.";
  }

  const max = opts.maxDays ?? 0;
  if (max > 0) {
    const span =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
    if (span > max) {
      from = addDays(to, -(max - 1));
      adjusted = `That period was longer than ${max} days, so it has been shortened.`;
    }
  }

  return { from, to, adjusted };
}

/** The Today page opens on today itself, in store time. */
export function defaultTodayRange(): { from: string; to: string } {
  const t = todayIso();
  return { from: t, to: t };
}

/** The range a report opens on: the current month, in store time. */
export function defaultMonthRange(): { from: string; to: string } {
  const today = todayIso();
  return { from: monthStart(today), to: today };
}

/** Unambiguous in writing. A native date input renders in the browser's
 *  locale, so on a US machine it shows 08/07/2026 for the 7th of August
 *  and no CSS changes that. Every picker restates its dates in words. */
export function prettyDate(iso: string): string {
  if (!isValidIsoDate(iso)) return "—";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const { y, m, d } = parts(iso);
  return `${String(d).padStart(2, "0")} ${months[m - 1] ?? ""} ${y}`;
}
