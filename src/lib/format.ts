import { APP } from "@/config/app";

const DATE = new Intl.DateTimeFormat(APP.locale, {
  day: "2-digit", month: "short", year: "numeric", timeZone: APP.timeZone,
});

const DATE_TIME = new Intl.DateTimeFormat(APP.locale, {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  timeZone: APP.timeZone,
});

/** Always rendered in store time. The owner is 12.5 hours behind the
 *  shops, and a document timestamped in Pacific time is a support ticket. */
export function formatDate(iso: string | null | undefined): string {
  return iso ? DATE.format(new Date(iso)) : "—";
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? DATE_TIME.format(new Date(iso)) : "—";
}

export function formatQty(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : new Intl.NumberFormat(APP.locale).format(n);
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
