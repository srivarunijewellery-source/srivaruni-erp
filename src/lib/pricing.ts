import type { Paise } from "@/types/domain";

/**
 * Pricing display helpers.
 *
 * The arithmetic itself lives in Postgres (recommend_price, sv_round_price)
 * so that a future POS, a bulk repricing job and this screen cannot drift
 * apart. Nothing here computes a price; these only format what the
 * database decided.
 */

/** Margins are basis points end to end. 5265 -> "52.7%". */
export function formatBps(bps: number | null | undefined, dp = 1): string {
  if (bps === null || bps === undefined) return "—";
  return `${(bps / 100).toFixed(dp)}%`;
}

/** "52.5" from a text input -> 5250. Null on anything unparseable. */
export function parsePercentToBps(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  if (cleaned === "" || !/^\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const pct = Number(cleaned);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return Math.round(pct * 100);
}

/**
 * Margin on the tag price, GST included — the same definition the
 * database uses. Recomputed here only so the screen can react to a typed
 * MRP before a round trip.
 */
export function marginBps(mrpPaise: Paise | null, landedPaise: Paise | null): number | null {
  if (!mrpPaise || mrpPaise <= 0 || landedPaise === null || landedPaise === undefined) {
    return null;
  }
  return Math.round(((mrpPaise - landedPaise) * 10000) / mrpPaise);
}

/** Where a margin sits relative to the band it was priced from. */
export type BandFit = "under" | "in" | "over" | "unknown";

export function bandFit(
  bps: number | null,
  loBps: number | null,
  hiBps: number | null,
): BandFit {
  if (bps === null || loBps === null || hiBps === null) return "unknown";
  if (bps < loBps) return "under";
  if (bps > hiBps) return "over";
  return "in";
}

export const BAND_FIT_TONE: Record<BandFit, "done" | "pending" | "danger" | "neutral"> = {
  in: "done",
  over: "pending",
  under: "danger",
  unknown: "neutral",
};

export const BAND_FIT_LABEL: Record<BandFit, string> = {
  in: "In band",
  over: "Above band",
  under: "Below band",
  unknown: "—",
};
