import { createClient } from "@/lib/supabase/server";

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
export async function listSellers(locationId: string): Promise<Seller[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, name, home_location_id")
    .eq("active", true)
    .order("name");
  if (error) return [];

  return (data ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      isHere: r.home_location_id === locationId,
    }))
    .sort((a, b) => (a.isHere === b.isHere ? 0 : a.isHere ? -1 : 1));
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  hasOpenRegister: boolean;
}

export async function listBranches(): Promise<Branch[]> {
  const supabase = await createClient();
  const [locRes, sesRes] = await Promise.all([
    supabase
      .from("locations")
      .select("id, code, name")
      .eq("active", true)
      .eq("kind", "store")
      .order("code"),
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
