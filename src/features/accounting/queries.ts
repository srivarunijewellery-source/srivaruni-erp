import { createClient } from "@/lib/supabase/server";

export type AccountKind = "asset" | "liability" | "equity" | "income" | "expense";

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
  systemKey: string | null;
  isExpenseCategory: boolean;
  active: boolean;
  note: string | null;
}

export async function listAccounts(expenseOnly = false): Promise<LedgerAccount[]> {
  const supabase = await createClient();
  let q = supabase
    .from("ledger_accounts")
    .select("id, code, name, kind, system_key, is_expense_category, active, note")
    .order("code");

  if (expenseOnly) q = q.eq("is_expense_category", true).eq("active", true);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind as AccountKind,
    systemKey: r.system_key,
    isExpenseCategory: Boolean(r.is_expense_category),
    active: Boolean(r.active),
    note: r.note,
  }));
}

export interface TaxRate {
  id: string;
  name: string;
  hsnCode: string | null;
  totalBps: number;
  isDefault: boolean;
  active: boolean;
  effectiveFrom: string;
  note: string | null;
}

export async function listTaxRates(): Promise<TaxRate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_rates")
    .select("id, name, hsn_code, total_bps, is_default, active, effective_from, note")
    .order("total_bps");
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    hsnCode: r.hsn_code,
    totalBps: Number(r.total_bps ?? 0),
    isDefault: Boolean(r.is_default),
    active: Boolean(r.active),
    effectiveFrom: r.effective_from,
    note: r.note,
  }));
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  kind: AccountKind;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number;
  lastEntryOn: string | null;
}

export async function getTrialBalance(): Promise<TrialBalanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trial_balance")
    .select("account_id, code, name, kind, debit_paise, credit_paise, balance_paise, last_entry_on")
    .order("code");
  if (error) throw error;

  return (data ?? []).map((r) => ({
    accountId: r.account_id,
    code: r.code,
    name: r.name,
    kind: r.kind as AccountKind,
    debitPaise: Number(r.debit_paise ?? 0),
    creditPaise: Number(r.credit_paise ?? 0),
    balancePaise: Number(r.balance_paise ?? 0),
    lastEntryOn: r.last_entry_on,
  }));
}

export interface JournalRow {
  id: string;
  entryNo: string;
  entryDate: string;
  narration: string | null;
  sourceType: string | null;
  sourceId: string | null;
  isAuto: boolean;
  isReversed: boolean;
  reversesId: string | null;
  locationCode: string | null;
  postedByName: string | null;
  lineCount: number;
  amountPaise: number;
}

export async function listJournals(limit = 100): Promise<JournalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_view")
    .select(`id, entry_no, entry_date, narration, source_type, source_id, is_auto,
             reverses_id, location_code, posted_by_name, line_count, amount_paise,
             is_reversed`)
    .order("entry_date", { ascending: false })
    .order("entry_no", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    entryNo: r.entry_no,
    entryDate: r.entry_date,
    narration: r.narration,
    sourceType: r.source_type,
    sourceId: r.source_id,
    isAuto: Boolean(r.is_auto),
    isReversed: Boolean(r.is_reversed),
    reversesId: r.reverses_id,
    locationCode: r.location_code,
    postedByName: r.posted_by_name,
    lineCount: Number(r.line_count ?? 0),
    amountPaise: Number(r.amount_paise ?? 0),
  }));
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debitPaise: number;
  creditPaise: number;
  note: string | null;
}

export async function getJournalLines(journalId: string): Promise<JournalLine[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_lines")
    .select("debit_paise, credit_paise, note, line_no, ledger_accounts:account_id(code, name)")
    .eq("journal_id", journalId)
    .order("line_no");
  if (error) throw error;

  type Row = {
    debit_paise: number;
    credit_paise: number;
    note: string | null;
    ledger_accounts: { code: string; name: string } | { code: string; name: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const a = Array.isArray(r.ledger_accounts) ? r.ledger_accounts[0] : r.ledger_accounts;
    return {
      accountCode: a?.code ?? "",
      accountName: a?.name ?? "",
      debitPaise: Number(r.debit_paise ?? 0),
      creditPaise: Number(r.credit_paise ?? 0),
      note: r.note,
    };
  });
}

export interface ExpenseRow {
  id: string;
  expenseNo: string;
  expenseDate: string;
  accountCode: string;
  accountName: string;
  locationCode: string | null;
  payee: string | null;
  amountPaise: number;
  taxPaise: number;
  totalPaise: number;
  itcEligible: boolean;
  method: string | null;
  reference: string | null;
  billRef: string | null;
  status: string;
  note: string | null;
}

export async function listExpenses(limit = 100): Promise<ExpenseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select(`id, expense_no, expense_date, amount_paise, tax_paise, total_paise,
             itc_eligible, method, reference, bill_ref, status, note, payee,
             ledger_accounts:account_id(code, name), locations:location_id(code)`)
    .order("expense_date", { ascending: false })
    .limit(limit);
  if (error) throw error;

  type Row = {
    id: string; expense_no: string; expense_date: string;
    amount_paise: number; tax_paise: number; total_paise: number;
    itc_eligible: boolean; method: string | null; reference: string | null;
    bill_ref: string | null; status: string; note: string | null; payee: string | null;
    ledger_accounts: { code: string; name: string } | { code: string; name: string }[] | null;
    locations: { code: string } | { code: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const a = Array.isArray(r.ledger_accounts) ? r.ledger_accounts[0] : r.ledger_accounts;
    const l = Array.isArray(r.locations) ? r.locations[0] : r.locations;
    return {
      id: r.id,
      expenseNo: r.expense_no,
      expenseDate: r.expense_date,
      accountCode: a?.code ?? "",
      accountName: a?.name ?? "",
      locationCode: l?.code ?? null,
      payee: r.payee,
      amountPaise: Number(r.amount_paise ?? 0),
      taxPaise: Number(r.tax_paise ?? 0),
      totalPaise: Number(r.total_paise ?? 0),
      itcEligible: Boolean(r.itc_eligible),
      method: r.method,
      reference: r.reference,
      billRef: r.bill_ref,
      status: r.status,
      note: r.note,
    };
  });
}

export interface PnlRow {
  section: string;
  code: string;
  name: string;
  amountPaise: number;
}

export async function getProfitAndLoss(from: string, to: string): Promise<PnlRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profit_and_loss", {
    p_from: from,
    p_to: to,
    p_location: null,
  });
  if (error) throw error;

  type Row = { section: string; code: string; name: string; amount_paise: number };
  return ((data ?? []) as Row[]).map((r) => ({
    section: r.section,
    code: r.code,
    name: r.name,
    amountPaise: Number(r.amount_paise ?? 0),
  }));
}

export interface UnpostedRow {
  docKind: string;
  docId: string;
  docNo: string | null;
  docDate: string | null;
  amountPaise: number;
  reason: string;
}

/**
 * Auto-posting swallows its own errors so accounting can never block a
 * sale. This is where those misses surface — an empty list is the only
 * proof the books are complete.
 */
export async function getUnposted(): Promise<UnpostedRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unposted_documents");
  if (error) return [];

  type Row = {
    doc_kind: string; doc_id: string; doc_no: string | null;
    doc_date: string | null; amount_paise: number; reason: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    docKind: r.doc_kind,
    docId: r.doc_id,
    docNo: r.doc_no,
    docDate: r.doc_date,
    amountPaise: Number(r.amount_paise ?? 0),
    reason: r.reason,
  }));
}

export async function listPaymentAccounts(): Promise<
  Array<{ id: string; name: string; kind: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("id, name, kind")
    .eq("active", true)
    .order("name");
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, kind: String(r.kind) }));
}
