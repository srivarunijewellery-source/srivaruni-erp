import { createClient } from "@/lib/supabase/server";

/**
 * The owner's day, in figures.
 *
 * Deliberately separate from features/dashboard: the dashboard answers
 * "how is the business doing over a year", this answers "what happened
 * today", and the second is checked on a phone between other things. The
 * queries behind them differ in shape as well as in span.
 */

export interface DaySummary {
  bills: number;
  pieces: number;
  revenuePaise: number;
  discountPaise: number;
  taxPaise: number;
  costPaise: number;
  marginPaise: number;
  returnsPaise: number;
  returnsCount: number;
  /** Distinct people, so someone who bought twice counts once. */
  customers: number;
  /** Bills with no customer attached. Kept separate: each is a person,
   *  but one walk-in cannot be told from another, so folding them into
   *  the distinct count would be inventing a number. */
  walkins: number;
}

const EMPTY: DaySummary = {
  bills: 0, pieces: 0, revenuePaise: 0, discountPaise: 0, taxPaise: 0,
  costPaise: 0, marginPaise: 0, returnsPaise: 0, returnsCount: 0,
  customers: 0, walkins: 0,
};

/**
 * Returns zeroes rather than throwing when the caller is not the owner.
 *
 * dash_today_summary raises for anyone else, which is the correct
 * behaviour at the database. Turning that raise into a crashed page
 * would be wrong: the page already refuses to render for a non-owner, so
 * reaching here at all means something unusual, and an empty figure is a
 * safer failure than a stack trace.
 */
export async function getDaySummary(
  from: string,
  to: string,
  locationId: string | null,
): Promise<DaySummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dash_today_summary", {
    p_from: from,
    p_to: to,
    p_location: locationId,
  });
  if (error) return EMPTY;

  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!r) return EMPTY;

  const n = (k: string) => Number(r[k] ?? 0);
  return {
    bills: n("bills"),
    pieces: n("pieces"),
    revenuePaise: n("revenue_paise"),
    discountPaise: n("discount_paise"),
    taxPaise: n("tax_paise"),
    costPaise: n("cost_paise"),
    marginPaise: n("margin_paise"),
    returnsPaise: n("returns_paise"),
    returnsCount: n("returns_count"),
    customers: n("customers"),
    walkins: n("walkins"),
  };
}

export interface StockValue {
  pieces: number;
  costPaise: number;
  retailPaise: number;
  items: number;
}

/**
 * What is on the shelf right now.
 *
 * Not filtered by date on purpose — stock value is a position, not a
 * flow. Filtering it by the same window as the sales figures would
 * produce a number that means nothing.
 */
export async function getStockValue(locationId: string | null): Promise<StockValue> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dash_stock_value", {
    p_location: locationId,
  });
  if (error) return { pieces: 0, costPaise: 0, retailPaise: 0, items: 0 };

  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!r) return { pieces: 0, costPaise: 0, retailPaise: 0, items: 0 };

  return {
    pieces: Number(r.pieces ?? 0),
    costPaise: Number(r.cost_paise ?? 0),
    retailPaise: Number(r.retail_paise ?? 0),
    items: Number(r.items ?? 0),
  };
}
