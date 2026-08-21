"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

export interface ScanOutcome {
  outcome: "counted" | "complete" | "over" | "unexpected" | "unknown";
  barcode?: string;
  name?: string;
  counted?: number;
  expected?: number;
  message?: string;
}

export interface AuditCandidate {
  itemId: string;
  barcode: string;
  name: string;
  category: string;
  variant: string | null;
  photoPath: string | null;
  qty: number;
  sellingPricePaise: number | null;
}

export interface AuditPreview {
  rows: AuditCandidate[];
  totalLines: number;
  totalPieces: number;
}

/**
 * What a count WOULD cover, before one exists.
 *
 * Filters alone are not a picture. "Chains and bangles at Boduppal" is a
 * sentence, not a shelf, and nobody can tell from it whether they are
 * about to count forty pieces or four hundred — 151 lines and 337 pieces
 * is a different afternoon from twelve and twelve.
 *
 * Runs the same WHERE that create_stock_audit will, so what is shown is
 * what gets counted. Two definitions of scope would drift the first time
 * either changed.
 */
export async function previewAudit(input: {
  locationId: string;
  categories?: string[];
  styles?: string[];
  platings?: string[];
  vendors?: string[];
  query?: string;
}): Promise<Result<AuditPreview>> {
  if (!input.locationId) return err("Choose a branch.");
  const supabase = await createClient();
  const nn = (a?: string[]) => (a && a.length > 0 ? a : null);

  const { data, error } = await supabase.rpc("stock_audit_preview", {
    p_location: input.locationId,
    p_categories: nn(input.categories),
    p_styles: nn(input.styles),
    p_platings: nn(input.platings),
    p_vendors: nn(input.vendors),
    p_query: input.query?.trim() || null,
    p_limit: 400,
  });
  if (error) return err(toMessage(error));

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return ok({
    totalLines: Number(rows[0]?.total_lines ?? 0),
    totalPieces: Number(rows[0]?.total_pieces ?? 0),
    rows: rows.map((r) => ({
      itemId: String(r.item_id),
      barcode: String(r.barcode),
      name: String(r.name),
      category: String(r.category ?? "—"),
      variant: (r.variant as string | null) ?? null,
      photoPath: (r.photo_path as string | null) ?? null,
      qty: Number(r.qty ?? 0),
      sellingPricePaise:
        r.selling_price_paise === null ? null : Number(r.selling_price_paise),
    })),
  });
}

/** Start a count. The slip freezes expected quantities as of now. */
export async function startAudit(input: {
  locationId: string;
  categories?: string[];
  styles?: string[];
  platings?: string[];
  vendors?: string[];
  query?: string;
  note?: string;
}): Promise<Result<string>> {
  if (!input.locationId) return err("Choose a branch.");
  const supabase = await createClient();
  const nn = (a?: string[]) => (a && a.length > 0 ? a : null);

  const { data, error } = await supabase.rpc("create_stock_audit", {
    p_location: input.locationId,
    p_categories: nn(input.categories),
    p_styles: nn(input.styles),
    p_platings: nn(input.platings),
    p_vendors: nn(input.vendors),
    p_query: input.query?.trim() || null,
    p_note: input.note?.trim() || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.audits);
  return ok(String(data));
}

/**
 * One scanned tag, one piece.
 *
 * Never rejects an unknown or off-slip tag outright: a piece found on
 * the shelf that the system did not expect is the most useful thing a
 * count turns up, and refusing it would throw the finding away. It is
 * recorded with an expected of zero so the variance reads correctly.
 */
export async function scanAudit(
  auditId: string,
  barcode: string,
): Promise<Result<ScanOutcome>> {
  const tag = barcode.trim();
  if (!tag) return err("Nothing scanned.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audit_scan", {
    p_audit: auditId,
    p_barcode: tag,
  });
  if (error) return err(toMessage(error));
  return ok(data as ScanOutcome);
}

/**
 * Typed rather than scanned, for a tag that will not read.
 *
 * Null clears the line back to uncounted, which is not the same as
 * counting zero: zero means "looked, none there", null means "not
 * looked at yet", and submitting depends on telling them apart.
 */
export async function setAuditCount(
  auditId: string,
  lineId: string,
  qty: number | null,
): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("audit_set_count", {
    p_line: lineId,
    p_qty: qty,
  });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.auditDetail(auditId));
  return ok(undefined);
}

export async function submitAudit(
  auditId: string,
): Promise<Result<{ docNo: string; variances: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_stock_audit", {
    p_audit: auditId,
  });
  if (error) return err(toMessage(error));
  const r = data as Record<string, unknown>;
  revalidatePath(ROUTES.auditDetail(auditId));
  return ok({ docNo: String(r.doc_no), variances: Number(r.variances ?? 0) });
}

export async function approveAudit(
  auditId: string,
): Promise<Result<{ docNo: string; adjustment: string; linesAdjusted: number; netPieces: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_stock_audit", {
    p_audit: auditId,
  });
  if (error) return err(toMessage(error));
  const r = data as Record<string, unknown>;

  revalidatePath(ROUTES.auditDetail(auditId));
  revalidatePath(ROUTES.stock);
  revalidatePath(ROUTES.adjustments);
  return ok({
    docNo: String(r.doc_no),
    adjustment: String(r.adjustment),
    linesAdjusted: Number(r.lines_adjusted ?? 0),
    netPieces: Number(r.net_pieces ?? 0),
  });
}
