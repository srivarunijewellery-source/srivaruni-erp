"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { pokeDispatchBestEffort } from "@/lib/comms/poke";
import {
  listCashMovements,
  listSessionBills,
  toDrawer,
  type CashMovement,
  type Drawer,
  type PosCatalogItem,
  type SessionBill,
} from "./queries";

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
export interface FinalisedBill {
  id: string;
  /** The invoice number. Printed on the slip the customer walks out with. */
  billNo: string;
}

export async function finaliseSale(
  input: FinaliseInput,
): Promise<Result<FinalisedBill>> {
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

  const id = String(data);

  // The slip was printing a dash where the invoice number belongs: the
  // receipt is built on the counter before this call and the bill number
  // is minted by the database inside it, so it has to be read back.
  // Failing to read it must not fail a sale that has already happened.
  const { data: billRow } = await supabase
    .from("bills")
    .select("bill_no")
    .eq("id", id)
    .maybeSingle();

  // Invoice email / WhatsApp for the customer, best effort — a comms
  // problem must never make a completed sale look failed.
  await pokeDispatchBestEffort();

  revalidatePath(ROUTES.pos);
  return ok({ id, billNo: billRow?.bill_no ?? "" });
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
  denominations: Record<string, number> | null = null,
): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_register", {
    p_location: locationId,
    p_float_paise: Math.round((floatRupees || 0) * 100),
    p_terminal: terminal || "Counter 1",
    p_denoms: denominations,
  });
  if (error) return err(toMessage(error));
  revalidatePath(ROUTES.pos);
  return ok(String(data));
}

export async function closeRegister(
  sessionId: string,
  countedPaise: number,
  note: string | null,
  denominations: Record<string, number> | null = null,
): Promise<Result<Record<string, unknown>>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_register", {
    p_session: sessionId,
    // Paise, not rupees: the count comes off a denomination grid, which
    // is already exact. Multiplying a float here was a rounding bug
    // waiting for the first ₹0.50 coin.
    p_counted_paise: Math.round(countedPaise || 0),
    p_note: note,
    p_denoms: denominations,
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

/* ------------------------------------------------------------------ */
/* The drawer                                                           */
/* ------------------------------------------------------------------ */

export type CashMovementKind = "pay_in" | "pay_out" | "expense";

/**
 * Money in or out of the till that is not a sale.
 *
 * Three different things, deliberately not collapsed into one signed
 * amount: change brought from the safe, cash taken out to bank, and a
 * small expense paid from the drawer. Only the last is a cost to the
 * business, and only the last posts to the books — moving cash between
 * the safe and the drawer is the same asset either side of the move.
 */
export async function recordCashMovement(
  sessionId: string,
  kind: CashMovementKind,
  amountPaise: number,
  reason: string | null,
  accountId: string | null,
): Promise<Result<Record<string, unknown>>> {
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return err("Enter an amount.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_cash_movement", {
    p_session: sessionId,
    p_kind: kind,
    p_amount_paise: Math.round(amountPaise),
    p_reason: reason,
    p_account: accountId,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.pos);
  return ok((data ?? {}) as Record<string, unknown>);
}

/** Re-read the drawer without reloading the counter. */
export async function fetchDrawer(sessionId: string): Promise<Result<Drawer>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_drawer", {
    p_session: sessionId,
  });
  if (error) return err(toMessage(error));

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) return err("That register session is gone.");
  return ok(toDrawer(row));
}

/** Bills rung on this session, newest first. */
export async function fetchSessionBills(
  sessionId: string,
): Promise<Result<SessionBill[]>> {
  return ok(await listSessionBills(sessionId));
}

export async function fetchCashMovements(
  sessionId: string,
): Promise<Result<CashMovement[]>> {
  return ok(await listCashMovements(sessionId));
}

/** Everything needed to re-print a slip that has already been rung. */
export async function fetchBillForReprint(billId: string): Promise<
  Result<{
    billNo: string;
    rungAt: string;
    customerName: string | null;
    customerPhone: string | null;
    grossPaise: number;
    discountPaise: number;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalPaise: number;
    lines: Array<{ name: string; qty: number; unitPaise: number; totalPaise: number }>;
    payments: Array<{ method: string; amount_paise: number; reference?: string }>;
  }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select(
      `bill_no, finalised_at, rung_at, created_at, gross_paise, discount_paise,
       taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise,
       customers:customer_id(name, phone),
       bill_lines(qty, unit_price_paise, line_total_paise, line_no, items:item_id(name)),
       bill_payments(method, amount_paise, reference)`,
    )
    .eq("id", billId)
    .maybeSingle();

  if (error || !data) return err("That bill could not be read back.");

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  type LineRow = {
    qty: number; unit_price_paise: number; line_total_paise: number;
    line_no: number | null; items: { name: string } | { name: string }[] | null;
  };
  type PayRow = { method: string; amount_paise: number; reference: string | null };

  const customer = one(
    data.customers as unknown as { name: string; phone: string } | { name: string; phone: string }[] | null,
  );
  const lines = ((data.bill_lines ?? []) as unknown as LineRow[])
    .slice()
    .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0));

  return ok({
    billNo: data.bill_no,
    rungAt: String(data.finalised_at ?? data.rung_at ?? data.created_at),
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    grossPaise: Number(data.gross_paise ?? 0),
    discountPaise: Number(data.discount_paise ?? 0),
    taxablePaise: Number(data.taxable_paise ?? 0),
    cgstPaise: Number(data.cgst_paise ?? 0),
    sgstPaise: Number(data.sgst_paise ?? 0),
    igstPaise: Number(data.igst_paise ?? 0),
    totalPaise: Number(data.total_paise ?? 0),
    lines: lines.map((l) => ({
      name: one(l.items)?.name ?? "Item",
      qty: Number(l.qty ?? 0),
      unitPaise: Number(l.unit_price_paise ?? 0),
      totalPaise: Number(l.line_total_paise ?? 0),
    })),
    payments: ((data.bill_payments ?? []) as unknown as PayRow[]).map((p) => ({
      method: p.method,
      amount_paise: Number(p.amount_paise ?? 0),
      reference: p.reference ?? undefined,
    })),
  });
}

/**
 * Search the whole catalogue, not the copy in the browser.
 *
 * pos_catalog ships every in-stock item at the location so the counter
 * can scan with the network down. Searching that copy works until the
 * catalogue is a few thousand SKUs, at which point anything not held at
 * this branch is simply absent and cannot be found at all. The local
 * copy still answers instantly; this fills in everything it does not
 * know about.
 */
export async function searchCatalog(
  locationId: string,
  term: string,
  limit = 30,
): Promise<Result<PosCatalogItem[]>> {
  const q = term.trim();
  if (q.length < 2) return ok([]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pos_search", {
    p_location: locationId,
    p_term: q,
    p_limit: limit,
  });
  if (error) return err(toMessage(error));

  type Row = {
    item_id: string; barcode: string | null; name: string;
    design_code: string | null; category: string | null; qty: number;
    price_paise: number; mrp_paise: number; gst_rate: number;
    photo_path: string | null;
  };

  return ok(
    ((data ?? []) as Row[]).map((r) => ({
      item_id: r.item_id,
      barcode: r.barcode,
      name: r.name,
      design_code: r.design_code,
      category: r.category,
      qty: Number(r.qty ?? 0),
      price_paise: Number(r.price_paise ?? 0),
      mrp_paise: Number(r.mrp_paise ?? 0),
      gst_rate: Number(r.gst_rate ?? 3),
      photoPath: r.photo_path ?? null,
    })),
  );
}

/* ------------------------------------------------------------------ */
/* Returns and customer credit                                          */
/* ------------------------------------------------------------------ */

export interface ReturnableLine {
  billLineId: string;
  itemId: string;
  itemName: string;
  barcode: string | null;
  qty: number;
  returnedQty: number;
  returnableQty: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}

export async function fetchBillForReturn(
  billId: string,
): Promise<Result<ReturnableLine[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bill_for_return", { p_bill: billId });
  if (error) return err(toMessage(error));

  return ok(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      billLineId: String(r.bill_line_id),
      itemId: String(r.item_id),
      itemName: String(r.item_name ?? "Item"),
      barcode: r.barcode ? String(r.barcode) : null,
      qty: Number(r.qty ?? 0),
      returnedQty: Number(r.returned_qty ?? 0),
      returnableQty: Number(r.returnable_qty ?? 0),
      unitPricePaise: Number(r.unit_price_paise ?? 0),
      lineTotalPaise: Number(r.line_total_paise ?? 0),
    })),
  );
}

export interface ReturnLineInput {
  bill_line_id: string;
  item_id: string;
  qty: number;
  /** False for damaged pieces: credited, but not put back on the shelf. */
  restock: boolean;
  reason?: string | null;
}

export async function recordSalesReturn(
  billId: string,
  lines: ReturnLineInput[],
  reason: string | null,
  note: string | null,
  sessionId: string | null,
): Promise<Result<{ returnNo: string; creditNoteNo: string; amountPaise: number }>> {
  if (lines.length === 0) return err("Nothing to return.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_sales_return", {
    p_bill: billId,
    p_lines: lines,
    p_reason: reason,
    p_note: note,
    p_session: sessionId,
  });
  if (error) return err(toMessage(error));

  const d = (data ?? {}) as Record<string, unknown>;
  revalidatePath(ROUTES.pos);
  return ok({
    returnNo: String(d.return_no ?? ""),
    creditNoteNo: String(d.credit_note_no ?? ""),
    amountPaise: Number(d.amount_paise ?? 0),
  });
}

export interface CustomerCredit {
  creditNoteId: string;
  noteNo: string;
  amountPaise: number;
  spentPaise: number;
  balancePaise: number;
  validUntil: string | null;
  returnNo: string | null;
}

export async function fetchCustomerCredits(
  customerId: string,
): Promise<Result<CustomerCredit[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_credits", {
    p_customer: customerId,
  });
  if (error) return err(toMessage(error));

  return ok(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      creditNoteId: String(r.credit_note_id),
      noteNo: String(r.note_no),
      amountPaise: Number(r.amount_paise ?? 0),
      spentPaise: Number(r.spent_paise ?? 0),
      balancePaise: Number(r.balance_paise ?? 0),
      validUntil: r.valid_until ? String(r.valid_until) : null,
      returnNo: r.return_no ? String(r.return_no) : null,
    })),
  );
}

/** Spend credit against a bill that already exists. */
export async function redeemCustomerCredit(
  billId: string,
  amountPaise: number,
): Promise<Result<Record<string, unknown>>> {
  if (amountPaise <= 0) return ok({});
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_customer_credit", {
    p_bill: billId,
    p_amount: Math.round(amountPaise),
  });
  if (error) return err(toMessage(error));
  return ok((data ?? {}) as Record<string, unknown>);
}

/** Hand a coupon to the customer standing at the counter. */
export async function assignCouponToCustomer(
  couponId: string,
  customerId: string,
): Promise<Result<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_coupon", {
    p_coupon: couponId,
    p_customer: customerId,
  });
  if (error) return err(toMessage(error));
  return ok(undefined);
}

/** Unassigned coupons that could be given out, newest batch first. */
export async function listAssignableCoupons(): Promise<
  Result<Array<{ id: string; code: string; batch: string; value: string }>>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .select("id, code, status, customer_id, coupon_batches(name, discount_kind, discount_bps, discount_paise)")
    // 'available' is the real status for an unassigned coupon. Filtering
    // on 'issued' matched nothing, which would have shown an empty list
    // forever with no error to explain it.
    .eq("status", "available")
    .is("customer_id", null)
    .order("serial")
    .limit(50);
  if (error) return err(toMessage(error));

  type Batch = {
    name: string; discount_kind: string;
    discount_bps: number | null; discount_paise: number | null;
  };

  return ok(
    (data ?? []).map((r) => {
      const raw = r.coupon_batches as unknown as Batch | Batch[] | null;
      const b = Array.isArray(raw) ? raw[0] : raw;
      return {
        id: r.id,
        code: r.code,
        batch: b?.name ?? "",
        value:
          b?.discount_kind === "percent"
            ? `${((b.discount_bps ?? 0) / 100).toFixed(0)}%`
            : `₹${((b?.discount_paise ?? 0) / 100).toFixed(0)}`,
      };
    }),
  );
}

/* ------------------------------------------------------------------ */
/* What this bill earns                                                 */
/* ------------------------------------------------------------------ */

export interface BillBenefits {
  gifts: Array<{ name: string; itemName: string; itemQty: number }>;
  /** Automatic scheme discount the server will apply at finalise. */
  schemePaise: number;
  schemeNames: string[];
}

/**
 * Gifts earned and schemes that apply, at the current cart value.
 *
 * These were configured in CRM and then never surfaced anywhere the
 * customer could be told about them, which makes them worth nothing: a
 * gift nobody is offered is not an offer. Both are worked out by the
 * same functions the finalise path uses, so the counter quotes exactly
 * what the bill will do rather than a second opinion.
 */
export async function fetchBillBenefits(
  locationId: string,
  lines: Array<{ item_id: string; qty: number; unit_price_paise: number; discount_paise: number }>,
  cartPaise: number,
): Promise<Result<BillBenefits>> {
  const supabase = await createClient();

  const [giftRes, discRes] = await Promise.all([
    cartPaise > 0
      ? supabase.rpc("allocate_gift_offers", {
          p_bill_paise: cartPaise,
          p_location: locationId,
          p_on: null,
        })
      : Promise.resolve({ data: [], error: null }),
    lines.length > 0
      ? supabase.rpc("resolve_discounts", {
          p_lines: lines,
          p_location: locationId,
          p_on: null,
          p_role: null,
          p_manual_bps: 0,
          p_manual_paise: 0,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const gifts = ((giftRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    name: String(r.name ?? ""),
    itemName: String(r.item_name ?? ""),
    itemQty: Number(r.item_qty ?? r.awards ?? 0),
  }));

  // resolve_discounts returns ONE object describing the whole bill, not
  // a row per line. Reading it as rows silently produced zero every
  // time, which is a large part of why schemes never showed up here.
  const d = (discRes.data ?? {}) as {
    total_discount_paise?: number;
    line_discount_paise?: number;
    invoice_discount_paise?: number;
    invoice_scheme_name?: string | null;
    lines?: Array<{ scheme_name?: string | null }>;
    notes?: string[];
  };

  const names = new Set<string>();
  if (d.invoice_scheme_name) names.add(d.invoice_scheme_name);
  for (const l of d.lines ?? []) {
    if (l.scheme_name) names.add(l.scheme_name);
  }

  const schemePaise =
    Number(d.line_discount_paise ?? 0) + Number(d.invoice_discount_paise ?? 0);

  return ok({ gifts, schemePaise, schemeNames: [...names] });
}

/**
 * Cheapest possible round trip, used to tell whether the shop's
 * connection is really back.
 *
 * navigator.onLine only reports whether a network interface is up. A
 * counter joined to the shop Wi-Fi while the broadband is down reads as
 * ONLINE by that measure, which is precisely the situation this system
 * exists to survive. So the counter believes an actual answer from the
 * server over the browser's opinion.
 */
export async function pingServer(): Promise<Result<number>> {
  return ok(Date.now());
}
