import { createClient } from "@/lib/supabase/server";
import type { TransferSummary } from "@/types/domain";

export async function listTransfers(): Promise<TransferSummary[]> {
  const supabase = await createClient();

  // transfer_pipeline is a security_invoker view, so RLS still applies.
  const { data, error } = await supabase
    .from("transfer_pipeline")
    .select("*")
    .order("requested_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) throw error;

  return (data ?? []).map((t) => ({
    id: t.id,
    docNo: t.doc_no,
    status: t.status,
    fromCode: t.from_code,
    toCode: t.to_code,
    reason: t.reason,
    lines: Number(t.lines ?? 0),
    qtySent: Number(t.qty_sent ?? 0),
    qtyReceived: Number(t.qty_received ?? 0),
    requestedAt: t.requested_at,
    receivedAt: t.received_at,
  }));
}
