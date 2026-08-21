"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { err, ok, toMessage, type Result } from "@/lib/result";

export type SelvaStatus =
  | "priced"
  | "unchanged"
  | "ambiguous"
  | "no_code"
  | "not_in_sheet"
  | "sheet_unused";

export interface SelvaCandidate {
  variant: string | null;
  paise: number;
  desc: string | null;
}

export interface SelvaMatch {
  /** "line" is an item on the inward, "sheet" a quotation row that
   *  reached no item. Both directions matter: a carton half entered at
   *  inward looks perfectly fine if you only ever check line to sheet. */
  kind: "line" | "sheet";
  lineId: string | null;
  barcode: string | null;
  itemName: string;
  code: string | null;
  sizeText: string | null;
  variant: string | null;
  status: SelvaStatus;
  ratePaise: number | null;
  wasPaise: number | null;
  candidates: SelvaCandidate[] | null;
  note: string | null;
  /** Pieces the document bills for this line, and pieces entered at
   *  inward. Reported, never enforced: a wrong count does not make the
   *  rate wrong, and refusing to price over a miscount would leave the
   *  whole document unpriced. */
  sheetQty: number | null;
  lineQty: number | null;
  qtyStatus: "ok" | "short" | "over" | "not_on_sheet";
}

export interface SelvaRowInput {
  code: string;
  variant: string | null;
  paise: number;
  desc: string;
  /** Pieces billed on this document line. */
  qty?: number;
}

/**
 * Match a Selva quotation against an inward, and optionally write it.
 *
 * Always run as a dry run first from the UI. Nothing is written until
 * someone has seen the report, because the failure this guards against
 * is not an error message -- it is a plausible wrong number that becomes
 * a landed cost, then a tag price, then a margin nobody questions.
 */
export async function applySelvaSheet(
  inwardId: string,
  rows: SelvaRowInput[],
  dryRun: boolean,
): Promise<Result<SelvaMatch[]>> {
  if (rows.length === 0) return err("No priceable rows were read from that PDF.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_selva_price_sheet", {
    p_inward: inwardId,
    // qty goes over as a string beside paise: the function validates
    // digits, and a float arriving from JSON would fail that quietly.
    p_rows: rows.map((r) => ({
      ...r,
      qty: r.qty === undefined ? null : String(Math.round(r.qty)),
    })),
    p_dry_run: dryRun,
  });
  if (error) return err(toMessage(error));

  const mapped = ((data ?? []) as Array<Record<string, unknown>>).map(
    (r): SelvaMatch => ({
      kind: r.kind === "sheet" ? "sheet" : "line",
      lineId: (r.line_id as string | null) ?? null,
      barcode: (r.barcode as string | null) ?? null,
      itemName: String(r.item_name ?? ""),
      code: (r.code as string | null) ?? null,
      sizeText: (r.size_text as string | null) ?? null,
      variant: (r.variant as string | null) ?? null,
      status: r.status as SelvaStatus,
      ratePaise: r.rate_paise === null ? null : Number(r.rate_paise),
      wasPaise: r.was_paise === null ? null : Number(r.was_paise),
      candidates: (r.candidates as SelvaCandidate[] | null) ?? null,
      note: (r.note as string | null) ?? null,
      sheetQty: r.sheet_qty === null ? null : Number(r.sheet_qty),
      lineQty: r.line_qty === null ? null : Number(r.line_qty),
      qtyStatus: (r.qty_status as SelvaMatch["qtyStatus"]) ?? "not_on_sheet",
    }),
  );

  if (!dryRun) revalidatePath(`/inward/${inwardId}`);
  return ok(mapped);
}

/**
 * Settle one ambiguous line by hand, and fix the data behind it.
 *
 * Writing the rate alone would leave the same question waiting on the
 * next shipment, because the reason it was ambiguous is that the item
 * has no usable size. So the chosen size is recorded on the item too,
 * and the line matches by itself from then on.
 *
 * The size option has to already exist -- this deliberately does not
 * invent attribute values from a vendor's PDF, which is how a size list
 * turns into forty spellings of the same thing.
 */
export async function resolveSelvaLine(
  inwardId: string,
  lineId: string,
  ratePaise: number,
  sizeValue: string | null,
  /** Resolves to a warning when the rate was written but the size could
   *  not be, so the screen can say so instead of implying both landed. */
): Promise<Result<string | null>> {
  const supabase = await createClient();

  const { data: line, error: lineErr } = await supabase
    .from("inward_lines")
    .select("id, item_id, items(gst_rate)")
    .eq("id", lineId)
    .maybeSingle();
  if (lineErr) return err(toMessage(lineErr));
  if (!line) return err("That line is no longer on this document.");

  const item = Array.isArray(line.items) ? line.items[0] : line.items;

  const { data: written, error: costErr } = await supabase
    .from("inward_line_costs")
    .upsert(
      {
        inward_line_id: lineId,
        rate_paise: ratePaise,
        gst_rate: item?.gst_rate ?? 3,
      },
      { onConflict: "inward_line_id" },
    )
    .select("inward_line_id");
  if (costErr) return err(toMessage(costErr));
  // .select() so a write RLS blocked reports as a failure rather than a
  // 200 that changed nothing.
  if (!written || written.length === 0) {
    return err("Only the owner can price an inward.");
  }

  // Recording the size is the half of this that stops the question
  // coming back, so a failure here is reported rather than swallowed.
  //
  // Matched through find_size_option, not on the raw string. The PDF
  // prints 24 and the size list holds "24 inch", so an exact match finds
  // nothing at all -- and the old `if (opt)` guard then skipped the
  // write in silence, leaving the line to ask the same question on every
  // future shipment while looking like it had been settled.
  let sizeNote: string | null = null;
  if (sizeValue) {
    const { data: optionId, error: findErr } = await supabase.rpc(
      "find_size_option",
      { p_variant: sizeValue },
    );
    if (findErr) return err(toMessage(findErr));

    if (!optionId) {
      // Either no option matches, or two do -- "30" and "30 Inch" both
      // exist and mean one thing. Priced either way; the size is left
      // alone rather than guessed, and the person is told why.
      sizeNote = `Priced, but the size could not be recorded: no single size option matches "${sizeValue}". Tidy the size list in settings and this line will match by itself next time.`;
    } else {
      const { data: sized, error: sizeErr } = await supabase
        .from("items")
        .update({ size_key: "size", size_id: optionId as string })
        .eq("id", line.item_id)
        .select("id");
      if (sizeErr) return err(toMessage(sizeErr));
      if (!sized || sized.length === 0) {
        sizeNote = "Priced, but the size could not be saved.";
      }
    }
  }

  const { error: computeErr } = await supabase.rpc("compute_inward_costs", {
    p_inward: inwardId,
  });
  if (computeErr) return err(toMessage(computeErr));

  revalidatePath(`/inward/${inwardId}`);
  return ok(sizeNote);
}
