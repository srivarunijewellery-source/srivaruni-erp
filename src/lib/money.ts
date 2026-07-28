import { APP } from "@/config/app";
import type { Paise } from "@/types/domain";

/**
 * Money helpers.
 *
 * The database stores BIGINT paise. Rupees exist only at the moment of
 * display or input. Doing arithmetic in rupees reintroduces the floating
 * point error the integer storage was chosen to avoid, so these are the
 * only two places a conversion happens.
 */

const RUPEE_FORMAT = new Intl.NumberFormat(APP.locale, {
  style: "currency",
  currency: APP.currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const RUPEE_FORMAT_COMPACT = new Intl.NumberFormat(APP.locale, {
  style: "currency",
  currency: APP.currency,
  maximumFractionDigits: 0,
});

/** 129900 -> "₹1,299.00" */
export function formatPaise(paise: Paise | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  return RUPEE_FORMAT.format(paise / 100);
}

/** 129900 -> "₹1,299". For dense tables and dashboard tiles. */
export function formatPaiseCompact(paise: Paise | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  return RUPEE_FORMAT_COMPACT.format(paise / 100);
}

/** "1299.50" -> 129950. Returns null on anything unparseable. */
export function parseRupeesToPaise(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (cleaned === "" || !/^\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const rupees = Number(cleaned);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

/** MRP suggestion at approval: landed cost x the category multiplier. */
export function suggestMrpPaise(landedCostPaise: Paise, multiplier: number): Paise {
  return Math.round(landedCostPaise * multiplier);
}
