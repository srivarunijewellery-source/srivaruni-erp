"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { pokeDispatchBestEffort } from "@/lib/comms/poke";

export interface SaleLine {
  item_id: string;
  qty: number;
  unit_price_paise: number;
  discount_paise: number;
  /** Credited seller for this line. Falls back to the bill's seller. */
  sold_by?: string | null;
}

export interface SalePayment {
  method: string;
  amount_paise: number;
  reference?: string | null;
  account_id?: string | null;
}

export interface FinaliseInput {
  client_uuid: string;
  location_id: string;
  lines: SaleLine[];
  payments: SalePayment[];
  customer_id?: string | null;
  sold_by?: string | null;
  coupon_id?: string | null;
  manual_discount_paise?: number;
  rung_at?: string;
  print_receipt?: boolean;
  note?: string | null;
  session_id?: string | null;
}

/**
 * Rings up one sale.
 *
 * client_uuid is minted by the counter before this is called, so a
 * retry after a timeout returns the same bill instead of charging the
 * customer twice.
 */
export async function finaliseSale(input: FinaliseInput): Promise<Result<string>> {
  if (input.lines.length === 0) return err("Nothing in the bill.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pos_finalise_bill", {
    p_client_uuid: input.client_uuid,
    p_location: input.location_id,
    p_lines: input.lines,
    p_payments: input.payments,
    p_customer: input.customer_id ?? null,
    p_sold_by: input.sold_by ?? null,
    p_coupon: input.coupon_id ?? null,
    p_manual_discount_paise: input.manual_discount_paise ?? 0,
    p_rung_at: input.rung_at ?? new Date().toISOString(),
    p_print: input.print_receipt ?? true,
    p_note: input.note ?? null,
    p_session: input.session_id ?? null,
  });

  if (error) return err(toMessage(error));

  // Invoice email / WhatsApp for the customer, best effort — a comms
  // problem must never make a completed sale look failed.
  await pokeDispatchBestEffort();

  revalidatePath(ROUTES.pos);
  return ok(String(data));
}

/** Replays sales rung up offline. Per-sale results; one bad row cannot block the rest. */
export async function syncOfflineSales(
  sales: FinaliseInput[],
): Promise<Result<Array<{ client_uuid: string; ok: boolean; bill_no: string | null; error: string | null }>>> {
  if (sales.length === 0) return ok([]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pos_sync_bills", { p_bills: sales });
  if (error) return err(toMessage(error));

  type Row = {
    out_client_uuid: string; out_bill_id: string | null;
    out_bill_no: string | null; out_ok: boolean; out_error: string | null;
  };

  await pokeDispatchBestEffort();
  revalidatePath(ROUTES.pos);

  return ok(
    ((data ?? []) as Row[]).map((r) => ({
      client_uuid: r.out_client_uuid,
      ok: Boolean(r.out_ok),
      bill_no: r.out_bill_no,
      error: r.out_error,
    })),
  );
}

export async function holdSale(
  clientUuid: string,
  locationId: string,
  lines: Array<{ item_id: string; qty: number }>,
  label: string | null,
  customerId: string | null,
  sessionId: string | null,
): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pos_hold_bill", {
    p_client_uuid: clientUuid,
    p_location: locationId,
    p_lines: lines,
    p_label: label,
    p_customer: customerId,
    p_session: sessionId,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.pos);
  return ok(String(data));
}

export async function discardHold(billId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("pos_discard_hold", { p_bill: billId });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.pos);
  return ok(undefined);
}

export async function resumeHold(billId: string): Promise<
  Result<{ lines: Array<{ item_id: string; qty: number }>; customer_id: string | null }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select("customer_id, bill_lines(item_id, qty)")
    .eq("id", billId)
    .maybeSingle();
  if (error || !data) return err("That held bill is no longer there.");

  const lines = (data.bill_lines ?? []) as Array<{ item_id: string; qty: number }>;
  return ok({ lines, customer_id: data.customer_id });
}

export async function openRegister(
  locationId: string,
  floatRupees: number,
  terminal: string,
): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_register", {
    p_location: locationId,
    p_float_paise: Math.round((floatRupees || 0) * 100),
    p_terminal: terminal || "Counter 1",
  });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.pos);
  return ok(String(data));
}

export async function closeRegister(
  sessionId: string,
  countedRupees: number,
  note: string | null,
): Promise<Result<Record<string, unknown>>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_register", {
    p_session: sessionId,
    p_counted_paise: Math.round((countedRupees || 0) * 100),
    p_note: note,
  });
  if (error) return err(toMessage(error));

  await pokeDispatchBestEffort();
  revalidatePath(ROUTES.pos);
  return ok((data ?? {}) as Record<string, unknown>);
}

export async function lookupCustomerExtras(customerId: string): Promise<
  Result<{
    history: Array<{ bill_no: string; bill_date: string; total_paise: number; items: number }>;
    coupons: Array<{
      coupon_id: string; code: string; value: string; kind: string;
      discount_bps: number; discount_paise: number;
      min_purchase_paise: number; valid_to: string | null;
    }>;
  }>
> {
  const supabase = await createClient();
  const [h, c] = await Promise.all([
    supabase.rpc("customer_history", { p_customer: customerId, p_limit: 10 }),
    supabase.rpc("customer_coupons", { p_customer: customerId }),
  ]);

  if (h.error) return err(toMessage(h.error));

  return ok({
    history: ((h.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      bill_no: String(r.bill_no),
      bill_date: String(r.bill_date),
      total_paise: Number(r.total_paise ?? 0),
      items: Number(r.items ?? 0),
    })),
    coupons: ((c.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      coupon_id: String(r.coupon_id),
      code: String(r.code),
      value: String(r.value),
      kind: String(r.kind ?? "amount"),
      discount_bps: Number(r.discount_bps ?? 0),
      discount_paise: Number(r.discount_paise ?? 0),
      min_purchase_paise: Number(r.min_purchase_paise ?? 0),
      valid_to: r.valid_to ? String(r.valid_to) : null,
    })),
  });
}
