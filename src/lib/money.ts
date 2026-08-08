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

/**
 * Whole rupees on screen. Exact paise underneath.
 *
 * Nobody in the shop deals in paise -- a tag reads 445, a customer hands
 * over 445, and ".00" on every figure is noise that makes a column of
 * numbers harder to scan. So every displayed figure rounds to the rupee.
 *
 * The rounding is HERE and nowhere else. The database still stores exact
 * paise, arithmetic still happens in paise, and parseRupeesToPaise still
 * accepts and keeps the paise a person types. Rounding on the way in, or
 * in the ledger, is how a business ends up with books that do not tie;
 * rounding on the way out costs nothing and is reversible.
 *
 * The consequence worth knowing: a column of rounded line figures will
 * sometimes not add up to the rounded total, by a rupee or two. That is
 * arithmetic, not a bug -- the total is rounded from the exact sum, not
 * summed from rounded parts, which is the correct way round.
 */
const RUPEE_FORMAT = new Intl.NumberFormat(APP.locale, {
  style: "currency",
  currency: APP.currency,
  maximumFractionDigits: 0,
});

const RUPEE_FORMAT_COMPACT = new Intl.NumberFormat(APP.locale, {
  style: "currency",
  currency: APP.currency,
  maximumFractionDigits: 0,
});

/** 129950 -> "₹1,300" */
export function formatPaise(paise: Paise | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  return RUPEE_FORMAT.format(paise / 100);
}

/** Same as formatPaise now that everything shows whole rupees. Kept
 *  so the call sites that ask for a compact figure still read clearly. */
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
