import { createClient } from "@/lib/supabase/server";

export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  dob: string | null;
  anniversary: string | null;
  gstin: string | null;
  pan: string | null;
  city: string | null;
  notes: string | null;
  createdAt: string;
}

const SELECT =
  "id, phone, name, email, dob, anniversary, gstin, pan, city, notes, created_at" as const;

type Row = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  dob: string | null;
  anniversary: string | null;
  gstin: string | null;
  pan: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
};

function toCustomer(r: Row): Customer {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    email: r.email,
    dob: r.dob,
    anniversary: r.anniversary,
    gstin: r.gstin,
    pan: r.pan,
    city: r.city,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

/**
 * Search by name or phone.
 *
 * Runs through the search_customers function rather than a query-builder
 * chain because staff look people up by the last few digits of a number
 * ("it ended 3210"), which needs both a prefix and a suffix match on the
 * normalised digits -- awkward to express safely through .or() string
 * interpolation, and a place user input could leak into a filter.
 */
export async function listCustomers(query = "", limit = 50): Promise<Customer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_customers", {
    p_query: query,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toCustomer);
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? toCustomer(data as Row) : null;
}

/** Upcoming birthdays and anniversaries, for the campaigns that come later. */
export async function listUpcomingOccasions(withinDays = 30): Promise<
  Array<{ customer: Customer; occasion: "birthday" | "anniversary"; date: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(SELECT)
    .or("dob.not.is.null,anniversary.not.is.null");

  if (error) throw error;

  const now = new Date();
  // Midnight, not "now". Comparing a date against a timestamp with a time
  // component pushes an occasion falling TODAY into next year -- which is
  // precisely the day a birthday campaign exists to catch.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: Array<{ customer: Customer; occasion: "birthday" | "anniversary"; date: string }> = [];

  // Day-of-year maths in JS rather than SQL: the "next occurrence of a
  // recurring month-day" comparison is fiddly across a year boundary, and
  // the customer list is small enough that filtering here is cheaper than
  // getting a clever date expression subtly wrong.
  for (const row of (data ?? []) as Row[]) {
    const customer = toCustomer(row);
    for (const [occasion, value] of [
      ["birthday", row.dob],
      ["anniversary", row.anniversary],
    ] as const) {
      if (!value) continue;

      // Split the ISO string by hand rather than new Date(value). Date
      // parses "1990-07-31" as UTC midnight, but getMonth/getDate read it
      // back in local time -- so anywhere behind UTC the 31st becomes the
      // 30th. The owner works from US Pacific, so this is not theoretical.
      const [, month, day] = value.split("-").map(Number);
      if (!month || !day) continue;

      const next = new Date(today.getFullYear(), month - 1, day);
      if (next < today) next.setFullYear(next.getFullYear() + 1);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      if (days <= withinDays) {
        // Format from the parts, not toISOString, for the same reason.
        const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
        out.push({ customer, occasion, date: iso });
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Purchase history                                                     */
/* ------------------------------------------------------------------ */

export interface CustomerSummary {
  bills: number;
  pieces: number;
  spentPaise: number;
  firstVisit: string | null;
  lastVisit: string | null;
  avgBillPaise: number;
  favouriteCategory: string | null;
}

export interface CustomerPurchaseLine {
  billId: string;
  billNo: string;
  billDate: string;
  billStatus: string;
  locationCode: string | null;
  itemId: string;
  itemName: string;
  barcode: string | null;
  category: string | null;
  qty: number;
  unitPricePaise: number;
  discountPaise: number;
  lineTotalPaise: number;
  soldByName: string | null;
}

/** One bill, with the pieces on it. */
export interface CustomerPurchase {
  billId: string;
  billNo: string;
  billDate: string;
  status: string;
  locationCode: string | null;
  totalPaise: number;
  lines: CustomerPurchaseLine[];
}

export async function getCustomerSummary(id: string): Promise<CustomerSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_summary", { p_customer: id });
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;

  if (error || !row) {
    return {
      bills: 0, pieces: 0, spentPaise: 0, firstVisit: null,
      lastVisit: null, avgBillPaise: 0, favouriteCategory: null,
    };
  }

  return {
    bills: Number(row.bills ?? 0),
    pieces: Number(row.pieces ?? 0),
    spentPaise: Number(row.spent_paise ?? 0),
    firstVisit: row.first_visit ? String(row.first_visit) : null,
    lastVisit: row.last_visit ? String(row.last_visit) : null,
    avgBillPaise: Number(row.avg_bill_paise ?? 0),
    favouriteCategory: row.favourite_category ? String(row.favourite_category) : null,
  };
}

/**
 * Every piece this customer has ever taken away, grouped back into the
 * bills they came on.
 *
 * The item level is the point: "what did she buy last time" is the
 * question actually asked at the counter, and a list of bill totals
 * cannot answer it. Grouping happens here rather than in SQL because a
 * one-to-many join is the natural shape to read and the wrong shape to
 * render.
 */
export async function listCustomerPurchases(
  id: string,
  limit = 200,
): Promise<CustomerPurchase[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_items", {
    p_customer: id,
    p_limit: limit,
  });
  if (error) return [];

  const out: CustomerPurchase[] = [];
  const byBill = new Map<string, CustomerPurchase>();

  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const line: CustomerPurchaseLine = {
      billId: String(raw.bill_id),
      billNo: String(raw.bill_no),
      billDate: String(raw.bill_date),
      billStatus: String(raw.bill_status ?? "final"),
      locationCode: raw.location_code ? String(raw.location_code) : null,
      itemId: String(raw.item_id),
      itemName: String(raw.item_name ?? "Item"),
      barcode: raw.barcode ? String(raw.barcode) : null,
      category: raw.category ? String(raw.category) : null,
      qty: Number(raw.qty ?? 0),
      unitPricePaise: Number(raw.unit_price_paise ?? 0),
      discountPaise: Number(raw.discount_paise ?? 0),
      lineTotalPaise: Number(raw.line_total_paise ?? 0),
      soldByName: raw.sold_by_name ? String(raw.sold_by_name) : null,
    };

    let bill = byBill.get(line.billId);
    if (!bill) {
      bill = {
        billId: line.billId,
        billNo: line.billNo,
        billDate: line.billDate,
        status: line.billStatus,
        locationCode: line.locationCode,
        totalPaise: 0,
        lines: [],
      };
      byBill.set(line.billId, bill);
      // The RPC already orders by date descending, so pushing as bills
      // are first seen keeps that order without a second sort.
      out.push(bill);
    }
    bill.lines.push(line);
    bill.totalPaise += line.lineTotalPaise;
  }

  return out;
}

export interface CustomerGift {
  billId: string;
  billNo: string;
  billDate: string;
  offerName: string;
  itemName: string | null;
  qty: number;
}

/**
 * Gifts this customer has been handed.
 *
 * Not owner-gated: the counter needs to be able to say "you already had
 * the free bangles in June" without opening the books.
 */
export async function listCustomerGifts(id: string): Promise<CustomerGift[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_gifts", { p_customer: id });
  if (error) return [];

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    billId: String(r.bill_id),
    billNo: String(r.bill_no),
    billDate: String(r.bill_date),
    offerName: String(r.offer_name ?? "Gift"),
    itemName: r.item_name ? String(r.item_name) : null,
    qty: Number(r.qty ?? 0),
  }));
}

/* ------------------------------------------------------------------ */
/* The list                                                             */
/* ------------------------------------------------------------------ */

export interface CustomerListRow {
  id: string;
  name: string | null;
  phone: string;
  city: string | null;
  bills: number;
  pieces: number;
  spentPaise: number;
  lastVisit: string | null;
  firstVisit: string | null;
  creditPaise: number;
  coupons: number;
}

export interface CustomerListPage {
  rows: CustomerListRow[];
  total: number;
}

export async function listCustomerRows(
  search: string,
  sort: string,
  limit = 40,
  offset = 0,
  from?: string | null,
  to?: string | null,
): Promise<CustomerListPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_list", {
    p_search: search || null,
    p_sort: sort || "spend",
    p_limit: limit,
    p_offset: offset,
    p_from: from ?? null,
    p_to: to ?? null,
  });
  if (error) return { rows: [], total: 0 };

  const raw = (data ?? []) as Array<Record<string, unknown>>;
  return {
    total: raw.length > 0 ? Number(raw[0]!.total_matching ?? 0) : 0,
    rows: raw.map((r) => ({
      id: String(r.id),
      name: r.name ? String(r.name) : null,
      phone: String(r.phone),
      city: r.city ? String(r.city) : null,
      bills: Number(r.bills ?? 0),
      pieces: Number(r.pieces ?? 0),
      spentPaise: Number(r.spent_paise ?? 0),
      lastVisit: r.last_visit ? String(r.last_visit) : null,
      firstVisit: r.first_visit ? String(r.first_visit) : null,
      creditPaise: Number(r.credit_paise ?? 0),
      coupons: Number(r.coupons ?? 0),
    })),
  };
}

export interface MonthPoint {
  month: string;
  key: string;
  from: string;
  to: string;
  bills: number;
  customers: number;
  revenuePaise: number;
}

export interface CustomerOverview {
  total: number;
  withBills: number;
  repeat: number;
  creditOut: number;
  byMonth: MonthPoint[];
}

export async function getCustomerOverview(
  from?: string | null,
  to?: string | null,
): Promise<CustomerOverview> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("customer_overview", {
    p_from: from ?? null,
    p_to: to ?? null,
  });
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    total: Number(d.total ?? 0),
    withBills: Number(d.with_bills ?? 0),
    repeat: Number(d.repeat ?? 0),
    creditOut: Number(d.credit_out ?? 0),
    byMonth: ((d.by_month ?? []) as Array<Record<string, unknown>>).map((m) => ({
      month: String(m.month ?? ""),
      key: String(m.key ?? ""),
      from: String(m.from ?? ""),
      to: String(m.to ?? ""),
      bills: Number(m.bills ?? 0),
      customers: Number(m.customers ?? 0),
      revenuePaise: Number(m.revenue_paise ?? 0),
    })),
  };
}
