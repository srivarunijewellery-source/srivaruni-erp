import { createClient } from "@/lib/supabase/server";

export interface PaymentAccount {
  id: string;
  name: string;
  kind: "bank" | "cash" | "wallet";
  bankName: string | null;
  balancePaise: number;
}

export interface VendorBalanceRow {
  vendorId: string;
  vendorName: string;
  purchasedPaise: number;
  paidPaise: number;
  advancePaise: number;
  duePaise: number;
  paymentTermsDays: number;
  lastPaymentAt: string | null;
}

export interface OpenBill {
  inwardId: string;
  docNo: string;
  invoiceNo: string | null;
  invoiceDate: string | null;
  totalPaise: number;
  paidPaise: number;
  duePaise: number;
}

export interface PaymentRow {
  id: string;
  docNo: string;
  vendorId: string;
  vendorName: string;
  accountName: string;
  amountPaise: number;
  allocatedPaise: number;
  paidOn: string;
  method: string;
  reference: string | null;
}

export async function listAccounts(): Promise<PaymentAccount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("id, name, kind, bank_name, account_balances(balance_paise)")
    .eq("active", true)
    .order("kind")
    .order("name");

  if (error) return [];
  return (data ?? []).map((a) => {
    const bal = Array.isArray(a.account_balances)
      ? a.account_balances[0]
      : a.account_balances;
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      bankName: a.bank_name,
      balancePaise: bal?.balance_paise ?? 0,
    };
  });
}

export async function listVendorBalances(): Promise<VendorBalanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_balances")
    .select(
      `vendor_id, vendor_name, purchased_paise, paid_paise,
       advance_paise, due_paise, payment_terms_days, last_payment_at`,
    )
    .order("due_paise", { ascending: false });

  if (error) return [];
  return (data ?? []).map((v) => ({
    vendorId: v.vendor_id,
    vendorName: v.vendor_name,
    purchasedPaise: Number(v.purchased_paise ?? 0),
    paidPaise: Number(v.paid_paise ?? 0),
    advancePaise: Number(v.advance_paise ?? 0),
    duePaise: Number(v.due_paise ?? 0),
    paymentTermsDays: v.payment_terms_days ?? 0,
    lastPaymentAt: v.last_payment_at,
  }));
}

/** Approved bills with something still owed on them. */
export async function listOpenBills(vendorId: string): Promise<OpenBill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_bill_status")
    .select("inward_id, doc_no, vendor_invoice_no, vendor_invoice_date, total_paise, paid_paise, due_paise")
    .eq("vendor_id", vendorId)
    .gt("due_paise", 0)
    .order("vendor_invoice_date", { nullsFirst: false });

  if (error) return [];
  return (data ?? []).map((b) => ({
    inwardId: b.inward_id,
    docNo: b.doc_no,
    invoiceNo: b.vendor_invoice_no,
    invoiceDate: b.vendor_invoice_date,
    totalPaise: Number(b.total_paise ?? 0),
    paidPaise: Number(b.paid_paise ?? 0),
    duePaise: Number(b.due_paise ?? 0),
  }));
}

export async function listPayments(vendorId?: string): Promise<PaymentRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("vendor_payments")
    .select(
      `id, doc_no, vendor_id, amount_paise, paid_on, method, reference,
       vendors(name), payment_accounts(name),
       vendor_payment_allocations(amount_paise)`,
    )
    .order("paid_on", { ascending: false })
    .limit(100);

  if (vendorId) q = q.eq("vendor_id", vendorId);

  const { data, error } = await q;
  if (error) return [];

  const one = <T,>(v: T | T[] | null): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  return (data ?? []).map((p) => ({
    id: p.id,
    docNo: p.doc_no,
    vendorId: p.vendor_id,
    vendorName: one(p.vendors)?.name ?? "—",
    accountName: one(p.payment_accounts)?.name ?? "—",
    amountPaise: p.amount_paise,
    allocatedPaise: ((p.vendor_payment_allocations ?? []) as Array<{ amount_paise: number }>)
      .reduce((s, a) => s + a.amount_paise, 0),
    paidOn: p.paid_on,
    method: p.method,
    reference: p.reference,
  }));
}
