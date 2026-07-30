import { createClient } from "@/lib/supabase/server";

/**
 * Settlement: what is owed on each bill, and what is available to settle it.
 *
 * Reversed payments and credit notes are excluded everywhere. A reversed
 * document keeps its row but must not count as money, or the balances go
 * quietly wrong.
 */

export interface SettlementBill {
  inwardId: string;
  docNo: string;
  totalPaise: number;
  appliedPaise: number;
  balancePaise: number;
}

export interface SettlementSource {
  id: string;
  kind: "payment" | "credit";
  label: string;
  dated: string;
  amountPaise: number;
  appliedPaise: number;
  availablePaise: number;
}

export interface Settlement {
  bills: SettlementBill[];
  sources: SettlementSource[];
}

export async function getSettlement(vendorId: string): Promise<Settlement> {
  const supabase = await createClient();

  const [bills, payments, credits, payAllocs, creditAllocs] = await Promise.all([
    supabase
      .from("vendor_purchase_history")
      .select("inward_id, doc_no, total_paise, approved_at")
      .eq("vendor_id", vendorId)
      .eq("status", "approved")
      .order("approved_at", { ascending: true }),
    supabase
      .from("vendor_payments")
      .select("id, doc_no, paid_on, amount_paise")
      .eq("vendor_id", vendorId)
      .is("reversed_at", null)
      .order("paid_on", { ascending: true }),
    supabase
      .from("vendor_credit_notes")
      .select("id, note_no, note_date, amount_paise")
      .eq("vendor_id", vendorId)
      .is("reversed_at", null)
      .order("note_date", { ascending: true }),
    supabase
      .from("vendor_payment_allocations")
      .select("payment_id, inward_id, amount_paise, vendor_payments!inner(vendor_id, reversed_at)")
      .eq("vendor_payments.vendor_id", vendorId)
      .is("vendor_payments.reversed_at", null),
    supabase
      .from("vendor_credit_allocations")
      .select("credit_note_id, inward_id, amount_paise, vendor_credit_notes!inner(vendor_id, reversed_at)")
      .eq("vendor_credit_notes.vendor_id", vendorId)
      .is("vendor_credit_notes.reversed_at", null),
  ]);

  const appliedToBill = new Map<string, number>();
  const usedBySource = new Map<string, number>();

  for (const a of payAllocs.data ?? []) {
    appliedToBill.set(a.inward_id, (appliedToBill.get(a.inward_id) ?? 0) + a.amount_paise);
    usedBySource.set(a.payment_id, (usedBySource.get(a.payment_id) ?? 0) + a.amount_paise);
  }
  for (const a of creditAllocs.data ?? []) {
    appliedToBill.set(a.inward_id, (appliedToBill.get(a.inward_id) ?? 0) + a.amount_paise);
    usedBySource.set(a.credit_note_id, (usedBySource.get(a.credit_note_id) ?? 0) + a.amount_paise);
  }

  const billRows: SettlementBill[] = (bills.data ?? []).map((b) => {
    const applied = appliedToBill.get(b.inward_id) ?? 0;
    return {
      inwardId: b.inward_id,
      docNo: b.doc_no,
      totalPaise: b.total_paise,
      appliedPaise: applied,
      balancePaise: Math.max(0, b.total_paise - applied),
    };
  });

  const sources: SettlementSource[] = [
    ...(payments.data ?? []).map((p) => {
      const used = usedBySource.get(p.id) ?? 0;
      return {
        id: p.id,
        kind: "payment" as const,
        label: p.doc_no ?? "Payment",
        dated: p.paid_on,
        amountPaise: p.amount_paise,
        appliedPaise: used,
        availablePaise: Math.max(0, p.amount_paise - used),
      };
    }),
    ...(credits.data ?? []).map((c) => {
      const used = usedBySource.get(c.id) ?? 0;
      return {
        id: c.id,
        kind: "credit" as const,
        label: c.note_no ? `Credit ${c.note_no}` : "Credit note",
        dated: c.note_date,
        amountPaise: c.amount_paise,
        appliedPaise: used,
        availablePaise: Math.max(0, c.amount_paise - used),
      };
    }),
  ];

  return { bills: billRows, sources };
}
