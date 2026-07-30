import { createClient } from "@/lib/supabase/server";
import type { Paise } from "@/types/domain";

export interface CreditNote {
  id: string;
  noteNo: string | null;
  noteDate: string;
  amountPaise: Paise;
  appliedPaise: Paise;
  reason: string | null;
  allocations: Array<{ inwardId: string; docNo: string; amountPaise: Paise }>;
}

/** Bills still carrying a balance, for allocating a credit against. */
export interface OpenBill {
  inwardId: string;
  docNo: string;
  totalPaise: Paise;
  approvedAt: string | null;
}

export async function listCreditNotes(vendorId: string): Promise<CreditNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_credit_notes")
    .select(
      `id, note_no, note_date, amount_paise, reason,
       vendor_credit_allocations(inward_id, amount_paise, inwards(doc_no))`,
    )
    .eq("vendor_id", vendorId)
    .order("note_date", { ascending: false });

  if (error) return [];

  return (data ?? []).map((n) => {
    const allocs = (n.vendor_credit_allocations ?? []) as Array<{
      inward_id: string;
      amount_paise: number;
      inwards: { doc_no: string } | { doc_no: string }[] | null;
    }>;
    return {
      id: n.id,
      noteNo: n.note_no,
      noteDate: n.note_date,
      amountPaise: n.amount_paise,
      appliedPaise: allocs.reduce((s, a) => s + a.amount_paise, 0),
      reason: n.reason,
      allocations: allocs.map((a) => ({
        inwardId: a.inward_id,
        docNo: (Array.isArray(a.inwards) ? a.inwards[0] : a.inwards)?.doc_no ?? "—",
        amountPaise: a.amount_paise,
      })),
    };
  });
}

export async function listOpenBills(vendorId: string): Promise<OpenBill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_purchase_history")
    .select("inward_id, doc_no, total_paise, approved_at")
    .eq("vendor_id", vendorId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []).map((b) => ({
    inwardId: b.inward_id,
    docNo: b.doc_no,
    totalPaise: b.total_paise,
    approvedAt: b.approved_at,
  }));
}
