import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/session";
import { isOwner } from "@/config/roles";

export interface PosCatalogItem {
  item_id: string;
  barcode: string | null;
  name: string;
  design_code: string | null;
  category: string | null;
  qty: number;
  price_paise: number;
  mrp_paise: number;
  gst_rate: number;
  /** Storage path of the primary photo, or null if none has been added. */
  photoPath: string | null;
}

/** Everything sellable at a store, for the counter to cache locally. */
export async function getPosCatalog(locationId: string): Promise<PosCatalogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pos_catalog", { p_location: locationId });
  if (error) throw error;

  type Row = {
    item_id: string; barcode: string | null; name: string;
    design_code: string | null; category: string | null; qty: number;
    price_paise: number; mrp_paise: number; gst_rate: number;
    photo_path: string | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
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
  }));
}

export interface OpenSession {
  id: string;
  locationId: string;
  openedAt: string;
  openingFloatPaise: number;
  openedByName: string | null;
}

export async function getOpenSession(locationId: string): Promise<OpenSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("register_sessions")
    .select("id, location_id, opened_at, opening_float_paise, staff:opened_by(name)")
    .eq("location_id", locationId)
    .eq("status", "open")
    .maybeSingle();
  if (error || !data) return null;

  const s = Array.isArray(data.staff) ? data.staff[0] : data.staff;
  return {
    id: data.id,
    locationId: data.location_id,
    openedAt: data.opened_at,
    openingFloatPaise: Number(data.opening_float_paise ?? 0),
    openedByName: (s as { name?: string } | null)?.name ?? null,
  };
}

export interface HeldBill {
  id: string;
  label: string | null;
  heldAt: string;
  customerName: string | null;
  lineCount: number;
  totalPaise: number;
}

export async function listHeldBills(locationId: string): Promise<HeldBill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select(`id, held_label, held_at, customers:customer_id(name),
             bill_lines(qty, line_total_paise)`)
    .eq("location_id", locationId)
    .eq("status", "held")
    .order("held_at", { ascending: false });
  if (error) return [];

  type Row = {
    id: string; held_label: string | null; held_at: string;
    customers: { name: string } | { name: string }[] | null;
    bill_lines: Array<{ qty: number; line_total_paise: number }> | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    const lines = r.bill_lines ?? [];
    return {
      id: r.id,
      label: r.held_label,
      heldAt: r.held_at,
      customerName: c?.name ?? null,
      lineCount: lines.reduce((s, l) => s + Number(l.qty ?? 0), 0),
      totalPaise: lines.reduce((s, l) => s + Number(l.line_total_paise ?? 0), 0),
    };
  });
}

export interface CustomerHit {
  id: string;
  phone: string;
  name: string | null;
  city: string | null;
  /** Decides CGST+SGST versus IGST. Null means treat as local. */
  state: string | null;
}

export async function searchCustomers(term: string): Promise<CustomerHit[]> {
  const q = term.trim();
  if (q.length < 3) return [];

  const supabase = await createClient();
  const digits = q.replace(/\D/g, "");

  // Phone is the identity people actually search by at a counter.
  const { data, error } = await supabase
    .from("customers")
    .select("id, phone, name, city, state")
    .or(digits.length >= 3 ? `phone.ilike.%${digits}%,name.ilike.%${q}%` : `name.ilike.%${q}%`)
    .limit(10);
  if (error) return [];

  return (data ?? []).map((r) => ({
    id: r.id, phone: r.phone, name: r.name, city: r.city, state: r.state,
  }));
}

export interface PaymentAccountOption {
  id: string;
  name: string;
  kind: string;
}

export async function listTills(): Promise<PaymentAccountOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("id, name, kind")
    .eq("active", true)
    .order("name");
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, kind: String(r.kind) }));
}

export interface Seller {
  id: string;
  name: string;
  isHere: boolean;
}

/**
 * Who can be credited with a sale at this branch.
 *
 * Everyone active is listed, not just those whose home store matches --
 * staff cover other branches, and a sale credited to nobody because the
 * person was rostered elsewhere that day is worse than a slightly
 * longer list. Home-branch people sort first.
 */
/**
 * Who can be credited with a sale at this counter.
 *
 * Only staff based here, plus anyone with no home branch set — an owner
 * or a floater who genuinely works across both. It used to return every
 * active person and merely sort the local ones first, so a Zaheerabad
 * cashier scrolled past nine Boduppal names to reach their own two.
 * That is how the wrong salesman gets picked, and salesman is what
 * commission is paid on.
 */
export async function listSellers(locationId: string): Promise<Seller[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, name, home_location_id")
    .eq("active", true)
    .or(`home_location_id.eq.${locationId},home_location_id.is.null`)
    .order("name");
  if (error) return [];

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    isHere: r.home_location_id === locationId,
  }));
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  hasOpenRegister: boolean;
}

/**
 * The branches this person may open a counter at.
 *
 * This is the list behind the counter's branch switcher — NOT
 * listStores, which is what I restricted first and which the counter
 * never calls. Everyone was offered both stores, so a Zaheerabad manager
 * could pick Boduppal and the app would open a till there.
 *
 * The database refuses that now regardless, but an option that always
 * ends in an error should not be on screen at all.
 */
export async function listBranches(): Promise<Branch[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  let locQuery = supabase
    .from("locations")
    .select("id, code, name")
    .eq("active", true)
    .eq("kind", "store")
    .order("code");

  // A null home branch is a genuine floater and keeps the full list.
  if (user && !isOwner(user.role) && user.locationId) {
    locQuery = locQuery.eq("id", user.locationId);
  }

  const [locRes, sesRes] = await Promise.all([
    locQuery,
    supabase.from("register_sessions").select("location_id").eq("status", "open"),
  ]);

  if (locRes.error) return [];
  const open = new Set((sesRes.data ?? []).map((r) => r.location_id));

  return (locRes.data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    hasOpenRegister: open.has(r.id),
  }));
}

export interface OpenSessionAt {
  id: string;
  terminal: string;
  openedByName: string | null;
  openedAt: string;
  openingFloatPaise: number;
}

/** Every counter currently open at a branch — a branch may run several. */
export async function listOpenSessions(locationId: string): Promise<OpenSessionAt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("register_sessions")
    .select("id, terminal, opened_at, opening_float_paise, staff:opened_by(name)")
    .eq("location_id", locationId)
    .eq("status", "open")
    .order("terminal");
  if (error) return [];

  return (data ?? []).map((r) => {
    const s = Array.isArray(r.staff) ? r.staff[0] : r.staff;
    return {
      id: r.id,
      terminal: r.terminal,
      openedByName: (s as { name?: string } | null)?.name ?? null,
      openedAt: r.opened_at,
      openingFloatPaise: Number(r.opening_float_paise ?? 0),
    };
  });
}

/* ------------------------------------------------------------------ */
/* The drawer                                                           */
/* ------------------------------------------------------------------ */

export interface Drawer {
  sessionId: string;
  terminal: string;
  locationName: string;
  status: string;
  openedAt: string;
  openingFloatPaise: number;
  bills: number;
  salesPaise: number;
  cashSalesPaise: number;
  cardPaise: number;
  upiPaise: number;
  otherPaise: number;
  payInPaise: number;
  payOutPaise: number;
  expensePaise: number;
  /** What should physically be in the till right now. */
  expectedPaise: number;
}

export function toDrawer(raw: Record<string, unknown>): Drawer {
  return {
    sessionId: String(raw.session_id),
    terminal: String(raw.terminal ?? ""),
    locationName: String(raw.location_name ?? ""),
    status: String(raw.status ?? "open"),
    openedAt: String(raw.opened_at),
    openingFloatPaise: Number(raw.opening_float_paise ?? 0),
    bills: Number(raw.bills ?? 0),
    salesPaise: Number(raw.sales_paise ?? 0),
    cashSalesPaise: Number(raw.cash_sales_paise ?? 0),
    cardPaise: Number(raw.card_paise ?? 0),
    upiPaise: Number(raw.upi_paise ?? 0),
    otherPaise: Number(raw.other_paise ?? 0),
    payInPaise: Number(raw.pay_in_paise ?? 0),
    payOutPaise: Number(raw.pay_out_paise ?? 0),
    expensePaise: Number(raw.expense_paise ?? 0),
    expectedPaise: Number(raw.expected_paise ?? 0),
  };
}

export async function getDrawer(sessionId: string): Promise<Drawer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_drawer", { p_session: sessionId });
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (error || !row) return null;
  return toDrawer(row);
}

export interface SessionBill {
  billId: string;
  billNo: string;
  rungAt: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  soldByName: string | null;
  items: number;
  totalPaise: number;
  paymentMode: string | null;
}

/**
 * Bills rung on THIS session only.
 *
 * Scoped to the session rather than to the day on purpose: once a
 * register is closed its bills stop being the counter's business, and a
 * staff member who cannot reach the Sales screen has no reason to be
 * scrolling through last week's invoices looking for one to reprint.
 */
export async function listSessionBills(sessionId: string): Promise<SessionBill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("session_bills", { p_session: sessionId });
  if (error) return [];

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    billId: String(r.bill_id),
    billNo: String(r.bill_no),
    rungAt: String(r.rung_at),
    status: String(r.status ?? "final"),
    customerName: r.customer_name ? String(r.customer_name) : null,
    customerPhone: r.customer_phone ? String(r.customer_phone) : null,
    soldByName: r.sold_by_name ? String(r.sold_by_name) : null,
    items: Number(r.items ?? 0),
    totalPaise: Number(r.total_paise ?? 0),
    paymentMode: r.payment_mode ? String(r.payment_mode) : null,
  }));
}

export interface CashMovement {
  id: string;
  kind: "pay_in" | "pay_out" | "expense";
  amountPaise: number;
  reason: string | null;
  accountName: string | null;
  staffName: string | null;
  createdAt: string;
}

export async function listCashMovements(sessionId: string): Promise<CashMovement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("session_cash_movements", {
    p_session: sessionId,
  });
  if (error) return [];

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    kind: String(r.kind) as CashMovement["kind"],
    amountPaise: Number(r.amount_paise ?? 0),
    reason: r.reason ? String(r.reason) : null,
    accountName: r.account_name ? String(r.account_name) : null,
    staffName: r.staff_name ? String(r.staff_name) : null,
    createdAt: String(r.created_at),
  }));
}

export interface ExpenseAccount {
  id: string;
  code: string;
  name: string;
}

/** What a counter expense can be booked against. */
export async function listExpenseAccounts(): Promise<ExpenseAccount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledger_accounts")
    .select("id, code, name, kind, active, system_key")
    .eq("kind", "expense")
    .eq("active", true)
    .order("code");
  if (error) return [];

  // Cost of goods and the suspense bucket are posted by the system, not
  // chosen by a person holding a tea receipt.
  const hidden = new Set(["cogs", "suspense", "stock_writeoff", "freight_inward"]);
  return (data ?? [])
    .filter((r) => !r.system_key || !hidden.has(String(r.system_key)))
    .map((r) => ({ id: r.id, code: r.code, name: r.name }));
}

export interface SessionPayment {
  seq: number;
  billId: string;
  billNo: string;
  rungAt: string;
  method: string;
  amountPaise: number;
  reference: string | null;
  customerName: string | null;
  customerPhone: string | null;
  salesman: string;
}

/**
 * Every non-cash payment in the session, numbered.
 *
 * Cash gets counted at close; UPI does not, so the only way to verify it
 * is to sit with the payment app and tick the list off one by one. That
 * list did not exist, which meant the UPI total was believed rather than
 * checked.
 */
export async function getSessionPayments(
  sessionId: string,
  method?: string,
): Promise<SessionPayment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("session_payments", {
    p_session: sessionId,
    p_method: method ?? null,
  });
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    seq: Number(r.seq ?? 0),
    billId: String(r.bill_id),
    billNo: String(r.bill_no),
    rungAt: String(r.rung_at),
    method: String(r.method),
    amountPaise: Number(r.amount_paise ?? 0),
    reference: (r.reference as string | null) ?? null,
    customerName: (r.customer_name as string | null) ?? null,
    customerPhone: (r.customer_phone as string | null) ?? null,
    salesman: String(r.salesman ?? "—"),
  }));
}
