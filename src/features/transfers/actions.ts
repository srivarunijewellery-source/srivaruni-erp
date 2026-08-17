"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { listPickableStock } from "./queries";
import type { PickableItem } from "@/types/domain";
import { pokeDispatchBestEffort } from "@/lib/comms/poke";

/** What a scan gives back, so the counter updates without a round trip. */
export interface ScanResult {
  itemId: string;
  barcode: string;
  name: string;
  /** Target for this line: requested when picking, sent when receiving. */
  target: number;
  counted: number;
  remaining: number;
  lineComplete: boolean;
  docComplete: boolean;
  /** True only from scan_pick: this barcode wasn't on the original request. */
  isExtra: boolean;
}

const uuid = z.string().uuid();
const idSchema = z.object({ transferId: uuid });

/** Every write touches the same four surfaces. */
function revalidate(transferId?: string) {
  revalidatePath(ROUTES.transfers);
  revalidatePath(ROUTES.transit);
  revalidatePath(ROUTES.stock);
  if (transferId) revalidatePath(ROUTES.transferDetail(transferId));
}

/* ------------------------------------------------------------------ raise */

const requestSchema = z.object({
  fromLocationId: uuid.describe("Choose where the stock is coming from."),
  toLocationId: uuid.describe("Choose where it is going."),
  reason: z.string().trim().min(1, "Say why the stock is moving."),
});

export async function requestTransfer(formData: FormData): Promise<Result<string>> {
  const parsed = requestSchema.safeParse({
    fromLocationId: formData.get("fromLocationId"),
    toLocationId: formData.get("toLocationId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the form.");

  if (parsed.data.fromLocationId === parsed.data.toLocationId) {
    return err("Source and destination must be different stores.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_transfer", {
    p_from: parsed.data.fromLocationId,
    p_to: parsed.data.toLocationId,
    p_reason: parsed.data.reason,
  });

  if (error) return err(toMessage(error));

  revalidate();
  return ok(String(data));
}

const cartLineSchema = z.object({
  itemId: uuid,
  qty: z.number().int().positive(),
});

const createRequestSchema = z.object({
  fromLocationId: uuid.describe("Choose where the stock is coming from."),
  toLocationId: uuid.describe("Choose where it is going."),
  reason: z.string().trim().min(1, "Say why the stock is moving."),
  note: z.string().trim().optional(),
  lines: z.array(cartLineSchema).min(1, "Select at least one item before creating the request."),
});

/**
 * Creates the transfer and every line in one database transaction.
 *
 * The item selection happens entirely in the browser first -- nothing is
 * written until this fires. That means no half-built request is ever
 * visible on the transfers list, and a browser closed mid-selection loses
 * nothing but an unsaved cart, not an orphaned document.
 */
export async function createTransferRequest(input: {
  fromLocationId: string;
  toLocationId: string;
  reason: string;
  note?: string;
  lines: { itemId: string; qty: number }[];
}): Promise<Result<string>> {
  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the request.");

  if (parsed.data.fromLocationId === parsed.data.toLocationId) {
    return err("Source and destination must be different stores.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_transfer_request", {
    p_from: parsed.data.fromLocationId,
    p_to: parsed.data.toLocationId,
    p_reason: parsed.data.reason,
    p_note: parsed.data.note || null,
    p_lines: parsed.data.lines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
  });

  if (error) return err(toMessage(error));

  revalidate();
  return ok(String(data));
}

/* ------------------------------------------------------------- build lines */

const lineSchema = z.object({
  transferId: uuid,
  itemId: uuid,
  qty: z.coerce.number().int().min(0, "Quantity cannot be negative."),
});

/** Sets a line to an absolute quantity. Zero removes it. */
export async function setTransferLine(formData: FormData): Promise<Result> {
  const parsed = lineSchema.safeParse({
    transferId: formData.get("transferId"),
    itemId: formData.get("itemId"),
    qty: formData.get("qty"),
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the quantity.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_transfer_line", {
    p_transfer: parsed.data.transferId,
    p_item: parsed.data.itemId,
    p_qty: parsed.data.qty,
  });
  if (error) return err(toMessage(error));

  revalidate(parsed.data.transferId);
  return ok(undefined);
}

/* --------------------------------------------------------------- approval */

/**
 * Changes what will actually ship, from the approval screen -- bump a
 * line up, trim it down, or add an item the picker never scanned at all.
 * Only reachable while the box sits at "picked, awaiting approval"; the
 * database enforces that, and separately refuses at approve_transfer if
 * the total exceeds what the source store actually holds.
 */
export async function setApprovalLine(formData: FormData): Promise<Result> {
  const parsed = lineSchema.safeParse({
    transferId: formData.get("transferId"),
    itemId: formData.get("itemId"),
    qty: formData.get("qty"),
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the quantity.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_approval_line", {
    p_transfer: parsed.data.transferId,
    p_item: parsed.data.itemId,
    p_qty: parsed.data.qty,
  });
  if (error) return err(toMessage(error));

  revalidate(parsed.data.transferId);
  return ok(undefined);
}

/** Search results for the "add another item" box on the approval screen. */
export async function searchAddableStock(
  locationId: string,
  query: string,
): Promise<Result<PickableItem[]>> {
  if (!query.trim()) return ok([]);
  try {
    const { items } = await listPickableStock(locationId, {
      query, inStockOnly: true, limit: 12,
    });
    return ok(items);
  } catch (e) {
    return err(toMessage(e));
  }
}

/* -------------------------------------------------------------------- pick */

export async function startPick(formData: FormData): Promise<Result> {
  const parsed = idSchema.safeParse({ transferId: formData.get("transferId") });
  if (!parsed.success) return err("Missing transfer reference.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_pick", { p_transfer: parsed.data.transferId });
  if (error) return err(toMessage(error));

  revalidate(parsed.data.transferId);
  return ok(undefined);
}

const scanSchema = z.object({
  transferId: uuid,
  barcode: z.string().trim().min(1, "Scan or type a barcode."),
  delta: z.coerce.number().int().default(1),
});

/**
 * One scan of one tag.
 *
 * The database owns every rule here — that the tag exists, that it belongs
 * on this document, that it has not already been fully counted. The screen
 * only renders whatever comes back, so a scanner firing faster than the UI
 * can never drive the count past the requested quantity.
 */
async function scan(
  rpc: "scan_pick" | "scan_receive",
  targetKey: "qty_requested" | "qty_sent",
  countedKey: "qty_picked" | "qty_received",
  formData: FormData,
): Promise<Result<ScanResult>> {
  const parsed = scanSchema.safeParse({
    transferId: formData.get("transferId"),
    barcode: formData.get("barcode"),
    delta: formData.get("delta") ?? 1,
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the scan.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpc, {
    p_transfer: parsed.data.transferId,
    p_barcode: parsed.data.barcode,
    p_delta: parsed.data.delta,
  });
  if (error) return err(toMessage(error));

  const r = data as Record<string, unknown>;
  revalidate(parsed.data.transferId);

  return ok({
    itemId: String(r.item_id),
    barcode: String(r.barcode),
    name: String(r.name),
    target: Number(r[targetKey]),
    counted: Number(r[countedKey]),
    remaining: Number(r.remaining),
    lineComplete: Boolean(r.line_complete),
    docComplete: Boolean(r.doc_complete),
    isExtra: Boolean(r.is_extra),
  });
}

export async function scanPick(formData: FormData): Promise<Result<ScanResult>> {
  return scan("scan_pick", "qty_requested", "qty_picked", formData);
}

export async function scanReceive(formData: FormData): Promise<Result<ScanResult>> {
  return scan("scan_receive", "qty_sent", "qty_received", formData);
}

const confirmPickSchema = z.object({
  transferId: uuid,
  note: z.string().trim().optional(),
});

export async function confirmPick(formData: FormData): Promise<Result> {
  const parsed = confirmPickSchema.safeParse({
    transferId: formData.get("transferId"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return err("Missing transfer reference.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_pick", {
    p_transfer: parsed.data.transferId,
    p_note: parsed.data.note || null,
  });
  if (error) return err(toMessage(error));
  await pokeDispatchBestEffort();

  revalidate(parsed.data.transferId);
  return ok(undefined);
}

/* --------------------------------------------------------- approve & ship */

export async function approveTransfer(formData: FormData): Promise<Result> {
  const parsed = idSchema.safeParse({ transferId: formData.get("transferId") });
  if (!parsed.success) return err("Missing transfer reference.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_transfer", {
    p_transfer: parsed.data.transferId,
  });
  if (error) return err(toMessage(error));
  await pokeDispatchBestEffort();

  revalidate(parsed.data.transferId);
  return ok(undefined);
}

const dispatchSchema = z.object({
  transferId: uuid,
  courier: z.string().trim().optional(),
  docket: z.string().trim().optional(),
});

export async function dispatchTransfer(formData: FormData): Promise<Result> {
  const parsed = dispatchSchema.safeParse({
    transferId: formData.get("transferId"),
    courier: formData.get("courier") ?? undefined,
    docket: formData.get("docket") ?? undefined,
  });
  if (!parsed.success) return err("Missing transfer reference.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("dispatch_transfer", {
    p_transfer: parsed.data.transferId,
    p_courier: parsed.data.courier || null,
    p_docket: parsed.data.docket || null,
  });
  if (error) return err(toMessage(error));
  await pokeDispatchBestEffort();

  revalidate(parsed.data.transferId);
  return ok(undefined);
}

/* ----------------------------------------------------------------- receive */

export async function receiveTransfer(formData: FormData): Promise<Result> {
  const parsed = idSchema.safeParse({ transferId: formData.get("transferId") });
  if (!parsed.success) return err("Missing transfer reference.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_transfer", {
    p_transfer: parsed.data.transferId,
    // Only ever true when the receiving store has said, in as many
    // words, that the shipment did not arrive. The database refuses a
    // blanket write-off otherwise — one stray scan used to convert a
    // whole document to "nothing arrived" and BOD-TR-000037 lost 119
    // pieces that way.
    p_confirm_nothing_arrived: formData.get("confirmNothingArrived") === "1",
  });
  if (error) return err(toMessage(error));
  await pokeDispatchBestEffort();

  revalidate(parsed.data.transferId);
  return ok(undefined);
}

/* ------------------------------------------------------------ stop the doc */

const reasonSchema = z.object({
  transferId: uuid,
  reason: z.string().trim().min(1, "Give a reason."),
});

export async function rejectTransfer(formData: FormData): Promise<Result> {
  const parsed = reasonSchema.safeParse({
    transferId: formData.get("transferId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Give a reason.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_transfer", {
    p_transfer: parsed.data.transferId,
    p_reason: parsed.data.reason,
  });
  if (error) return err(toMessage(error));
  await pokeDispatchBestEffort();

  revalidate(parsed.data.transferId);
  return ok(undefined);
}

export async function cancelTransfer(formData: FormData): Promise<Result> {
  const parsed = reasonSchema.safeParse({
    transferId: formData.get("transferId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Give a reason.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_transfer", {
    p_transfer: parsed.data.transferId,
    p_reason: parsed.data.reason,
  });
  if (error) return err(toMessage(error));

  revalidate(parsed.data.transferId);
  return ok(undefined);
}

/**
 * Corrects the reason and note on a request that has not moved yet.
 *
 * The reason is what the receiving store reads to understand why a
 * hundred and eighty pieces are arriving, and it is typed in a hurry
 * while raising the request. Being unable to fix a typo in it meant
 * cancelling the whole transfer and rebuilding the lines, which is why
 * nobody bothered and the wrong reason stayed.
 *
 * Only while it is still a request. Once picking starts the document is
 * a record of what people acted on, and rewriting its stated purpose
 * after the fact is how a paper trail stops being one.
 */
export async function updateTransferHeader(
  transferId: string,
  reason: string,
  note: string,
): Promise<Result<void>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transfers")
    .update({
      reason: reason.trim() || null,
      note: note.trim() || null,
    })
    .eq("id", transferId)
    .eq("status", "requested")
    .select("id");

  if (error) return err(toMessage(error));
  // .select() so RLS filtering it out reports as a failure rather than a
  // silent 200 that wrote nothing.
  if (!data || data.length === 0) {
    return err("That transfer can no longer be edited — picking has already started.");
  }

  revalidatePath(ROUTES.transferDetail(transferId));
  revalidatePath(ROUTES.transfers);
  return ok(undefined);
}

/**
 * Opens a transfer already in picking, with no request step.
 *
 * The request exists so one store can ASK another for stock. When the
 * owner is standing at Boduppal deciding what to send to Zaheerabad
 * there is nobody to ask — the request becomes a form filled in and
 * approved by the same person a minute later.
 *
 * Everything after this point is unchanged: scan, mark picked, approve,
 * dispatch, receive. Items are added by scanning them, which records
 * them as qty_requested 0 — accurate, since nobody requested them.
 */
export async function startDirectPick(
  fromId: string,
  toId: string,
  reason: string,
  note: string,
): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_direct_pick", {
    p_from: fromId,
    p_to: toId,
    p_reason: reason.trim() || null,
    p_note: note.trim() || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.transfers);
  return ok(String(data));
}

export interface PipelineCell {
  stage: string;
  category: string;
  style: string;
  items: number;
  pieces: number;
  retailPaise: number;
}

/** What is in movement, split by category and style. */
export async function getTransferPipeline(
  locationId?: string,
): Promise<Result<PipelineCell[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_pipeline_breakdown", {
    p_location: locationId ?? null,
    p_stage: null,
  });
  if (error) return err(toMessage(error));

  return ok(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      stage: String(r.stage),
      category: String(r.category),
      style: String(r.style),
      items: Number(r.items ?? 0),
      pieces: Number(r.pieces ?? 0),
      retailPaise: Number(r.retail_paise ?? 0),
    })),
  );
}

/**
 * Discards a transfer request that was never acted on.
 *
 * Only before picking starts — the database refuses after that, since
 * from then on the document describes something that physically
 * happened. A request created by mistake previously had no way out and
 * sat holding stock as committed.
 */
export async function deleteTransfer(formData: FormData): Promise<Result<void>> {
  const parsed = idSchema.safeParse({ transferId: formData.get("transferId") });
  if (!parsed.success) return err("Missing transfer reference.");

  const reason = String(formData.get("reason") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_transfer", {
    p_transfer: parsed.data.transferId,
    p_reason: reason || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.transfers);
  return ok(undefined);
}
