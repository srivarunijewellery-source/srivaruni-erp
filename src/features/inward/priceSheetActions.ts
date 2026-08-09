"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { revalidateInwardCosts } from "./costCache";

export interface SheetLine {
  lineId: string;
  itemName: string;
  code: string | null;
  matched: boolean;
  ratePaise: number | null;
  reason: string | null;
}

export interface SheetOutcome {
  matched: number;
  unmatched: number;
  lines: SheetLine[];
}

/**
 * Apply a vendor's price sheet to an inward.
 *
 * The rows arrive already parsed and column-mapped by the browser; the
 * matching itself happens in the database, because parse_design_code
 * lives there and reimplementing its 8-versus-7 digit rule in TypeScript
 * is how the two quietly start disagreeing about what a code is.
 */
export async function applyPriceSheet(
  inwardId: string,
  rows: Array<{ sku: string; paise: number }>,
  pricesIncludeGst: boolean,
): Promise<Result<SheetOutcome>> {
  if (rows.length === 0) return err("There is nothing usable in that sheet.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_price_sheet", {
    p_inward: inwardId,
    p_rows: rows,
    p_prices_include_gst: pricesIncludeGst,
  });

  if (error) return err(toMessage(error));

  const lines = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    lineId: String(r.line_id),
    itemName: String(r.item_name ?? ""),
    code: (r.code as string | null) ?? null,
    matched: Boolean(r.matched),
    ratePaise: r.rate_paise === null ? null : Number(r.rate_paise),
    reason: (r.reason as string | null) ?? null,
  }));

  await revalidateInwardCosts(inwardId);
  revalidatePath(`/inward/${inwardId}`);

  return ok({
    matched: lines.filter((l) => l.matched).length,
    unmatched: lines.filter((l) => !l.matched).length,
    lines,
  });
}
