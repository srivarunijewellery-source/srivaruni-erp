import { createClient } from "@/lib/supabase/server";

export interface BankAlert {
  id: string;
  receivedAt: string;
  fromAddress: string | null;
  subject: string | null;
  rawText: string | null;
  txnDate: string | null;
  amountPaise: number | null;
  direction: "debit" | "credit" | null;
  merchant: string | null;
  reference: string | null;
  accountTail: string | null;
  parseNote: string | null;
  status: string;
  expenseNo: string | null;
}

export async function listBankInbox(status = "new"): Promise<BankAlert[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_bank_inbox", {
    p_status: status,
    p_limit: 200,
  });
  if (error) return [];

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    receivedAt: String(r.received_at),
    fromAddress: r.from_address ? String(r.from_address) : null,
    subject: r.subject ? String(r.subject) : null,
    rawText: r.raw_text ? String(r.raw_text) : null,
    txnDate: r.txn_date ? String(r.txn_date) : null,
    amountPaise: r.amount_paise === null ? null : Number(r.amount_paise),
    direction: (r.direction as BankAlert["direction"]) ?? null,
    merchant: r.merchant ? String(r.merchant) : null,
    reference: r.reference ? String(r.reference) : null,
    accountTail: r.account_tail ? String(r.account_tail) : null,
    parseNote: r.parse_note ? String(r.parse_note) : null,
    status: String(r.status),
    expenseNo: r.expense_no ? String(r.expense_no) : null,
  }));
}
