import { createClient } from "@/lib/supabase/server";

export interface SalesReturnRow {
  id: string;
  returnNo: string;
  returnDate: string;
  billNo: string | null;
  customerName: string | null;
  customerPhone: string | null;
  locationCode: string | null;
  totalPaise: number;
  pieces: number;
  reason: string | null;
  staffName: string | null;
}

export interface ReturnFilters {
  from?: string;
  to?: string;
  location?: string;
  q?: string;
}

export async function listSalesReturns(
  filters: ReturnFilters = {},
): Promise<SalesReturnRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("sales_returns")
    .select(
      `id, return_no, return_date, total_paise, reason,
       bills:bill_id(bill_no),
       customers:customer_id(name, phone),
       locations:location_id(code),
       staff:created_by(name),
       sales_return_lines(qty)`,
    )
    .order("return_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.from) query = query.gte("return_date", filters.from);
  if (filters.to) query = query.lte("return_date", filters.to);
  if (filters.location) query = query.eq("location_id", filters.location);
  if (filters.q?.trim()) query = query.ilike("return_no", `%${filters.q.trim()}%`);

  const { data, error } = await query;
  if (error) return [];

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  return (data ?? []).map((r) => {
    const bill = one(r.bills as unknown as { bill_no: string } | null);
    const customer = one(r.customers as unknown as { name: string; phone: string } | null);
    const location = one(r.locations as unknown as { code: string } | null);
    const staff = one(r.staff as unknown as { name: string } | null);
    const lines = (r.sales_return_lines ?? []) as unknown as Array<{ qty: number }>;

    return {
      id: r.id,
      returnNo: r.return_no,
      returnDate: r.return_date,
      billNo: bill?.bill_no ?? null,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      locationCode: location?.code ?? null,
      totalPaise: Number(r.total_paise ?? 0),
      pieces: lines.reduce((s, l) => s + Number(l.qty ?? 0), 0),
      reason: r.reason,
      staffName: staff?.name ?? null,
    };
  });
}

export interface CreditNoteRow {
  creditNoteId: string;
  noteNo: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  amountPaise: number;
  spentPaise: number;
  balancePaise: number;
  validUntil: string | null;
  returnNo: string | null;
  usable: boolean;
}

/**
 * Outstanding customer credit.
 *
 * This is a real liability sitting on the books, so it is worth seeing
 * as a total rather than discovering one note at a time at the counter.
 */
export async function listCreditNotes(onlyOpen = true): Promise<CreditNoteRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("customer_credit_balances")
    .select(
      `credit_note_id, note_no, customer_id, customer_name, customer_phone,
       amount_paise, spent_paise, balance_paise, valid_until, return_no, usable, created_at`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (onlyOpen) query = query.eq("usable", true);

  const { data, error } = await query;
  if (error) return [];

  return (data ?? []).map((r) => ({
    creditNoteId: r.credit_note_id,
    noteNo: r.note_no,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    amountPaise: Number(r.amount_paise ?? 0),
    spentPaise: Number(r.spent_paise ?? 0),
    balancePaise: Number(r.balance_paise ?? 0),
    validUntil: r.valid_until,
    returnNo: r.return_no,
    usable: Boolean(r.usable),
  }));
}
