"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function recordExpense(formData: FormData): Promise<Result<string>> {
  const accountId = String(formData.get("accountId") ?? "");
  const rupees = Number(formData.get("amountRupees") ?? 0);
  const date = String(formData.get("expenseDate") ?? "");

  if (!accountId) return err("Pick a category.");
  if (!Number.isFinite(rupees) || rupees <= 0) return err("Enter an amount.");
  if (date && !DATE.test(date)) return err("That date does not look right.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_expense", {
    p_account: accountId,
    // Rupees in the form, paise in the database — converted once, here,
    // so nothing downstream has to wonder which unit it is holding.
    p_amount: Math.round(rupees * 100),
    p_date: date || null,
    p_location: String(formData.get("locationId") ?? "") || null,
    p_vendor: String(formData.get("vendorId") ?? "") || null,
    p_payee: String(formData.get("payee") ?? "") || null,
    p_tax_rate: String(formData.get("taxRateId") ?? "") || null,
    p_itc: formData.get("itcEligible") === "on",
    p_paid_from: String(formData.get("paidFromId") ?? "") || null,
    p_method: String(formData.get("method") ?? "") || null,
    p_reference: String(formData.get("reference") ?? "") || null,
    p_bill_ref: String(formData.get("billRef") ?? "") || null,
    p_note: String(formData.get("note") ?? "") || null,
    p_unpaid: formData.get("unpaid") === "on",
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.expenses);
  revalidatePath(ROUTES.journals);
  revalidatePath(ROUTES.trialBalance);
  return ok(String(data));
}

export async function reverseExpense(formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return err("Missing expense.");
  if (!reason) return err("Give a reason — it goes on the reversing entry.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_expense", {
    p_id: id,
    p_reason: reason,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.expenses);
  revalidatePath(ROUTES.journals);
  revalidatePath(ROUTES.trialBalance);
  return ok(undefined);
}

export async function reverseJournal(formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return err("Missing entry.");
  if (!reason) return err("Give a reason — it goes on the reversing entry.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_journal", {
    p_id: id,
    p_reason: reason,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.journals);
  revalidatePath(ROUTES.trialBalance);
  return ok(undefined);
}

/**
 * A manual entry. Lines arrive as rupee strings from the form and are
 * converted here; the database only ever sees paise.
 */
export async function postManualJournal(
  narration: string,
  entryDate: string,
  lines: Array<{ account: string; debit: number; credit: number; note?: string }>,
): Promise<Result<string>> {
  if (!narration.trim()) return err("Give the entry a narration.");
  if (lines.length < 2) return err("An entry needs at least two lines.");

  const totalDr = lines.reduce((s, l) => s + Math.round((l.debit || 0) * 100), 0);
  const totalCr = lines.reduce((s, l) => s + Math.round((l.credit || 0) * 100), 0);
  if (totalDr !== totalCr) {
    return err("Debits and credits do not match. Fix the lines before posting.");
  }
  if (totalDr === 0) return err("The entry is empty.");

  const payload = lines
    .filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0)
    .map((l) => ({
      account: l.account,
      debit: Math.round((l.debit || 0) * 100),
      credit: Math.round((l.credit || 0) * 100),
      note: l.note ?? null,
    }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_journal", {
    p_lines: payload,
    p_narration: narration,
    p_date: entryDate || null,
    p_source_type: "manual",
    p_source_id: null,
    p_location: null,
    p_is_auto: false,
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.journals);
  revalidatePath(ROUTES.trialBalance);
  return ok(String(data));
}

export async function saveAccount(formData: FormData): Promise<Result> {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  if (!code || !name || !kind) return err("Code, name and type are all needed.");

  const supabase = await createClient();
  const { error } = await supabase.from("ledger_accounts").insert({
    code,
    name,
    kind,
    is_expense_category: formData.get("isExpenseCategory") === "on",
    note: String(formData.get("note") ?? "") || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.accounts);
  return ok(undefined);
}

/**
 * Posts documents that predate the accounting module. Safe to re-run —
 * each branch skips anything already posted.
 */
export async function backfillAccounting(): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("backfill_accounting");
  if (error) return err(toMessage(error));

  const row = Array.isArray(data) ? data[0] : data;
  const posted = Number(row?.posted ?? 0);
  const skipped = Number(row?.skipped ?? 0);

  revalidatePath(ROUTES.journals);
  revalidatePath(ROUTES.trialBalance);
  revalidatePath(ROUTES.gst);

  if (posted === 0 && skipped === 0) return ok("Nothing left to post.");
  return ok(
    `Posted ${posted} document${posted === 1 ? "" : "s"}` +
      (skipped > 0 ? `, skipped ${skipped} with no costing yet.` : "."),
  );
}

/**
 * Demo billing history, so the reports have something to show before
 * the POS exists. Deliberately does NOT move stock — the stock ledger
 * is append-only and blocks deletes, so demo sales would permanently
 * distort on-hand counts for real inventory.
 */
export async function seedDemoBills(months: number): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seed_demo_bills", { p_months: months });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.journals);
  revalidatePath(ROUTES.trialBalance);
  revalidatePath(ROUTES.pnl);
  return ok(`Created ${Number(data ?? 0)} demo bills.`);
}

export async function clearDemoData(): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clear_demo_data");
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.journals);
  revalidatePath(ROUTES.trialBalance);
  revalidatePath(ROUTES.pnl);
  return ok(`Removed ${Number(data ?? 0)} demo bills and their entries.`);
}

/**
 * Presented to the user as "edit". Reverses the original and posts the
 * corrected version in one transaction — the ledger keeps all three
 * rows, so the trial balance stays correct and any past date is still
 * reconstructable.
 */
export async function amendJournal(
  id: string,
  narration: string,
  entryDate: string,
  reason: string,
  lines: Array<{ account: string; debit: number; credit: number; note?: string }>,
): Promise<Result<string>> {
  if (!reason.trim()) return err("Give a reason — it goes on the reversing entry.");

  const totalDr = lines.reduce((s, l) => s + Math.round((l.debit || 0) * 100), 0);
  const totalCr = lines.reduce((s, l) => s + Math.round((l.credit || 0) * 100), 0);
  if (totalDr !== totalCr) return err("Debits and credits do not match.");
  if (totalDr === 0) return err("The entry is empty.");

  const payload = lines
    .filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0)
    .map((l) => ({
      account: l.account,
      debit: Math.round((l.debit || 0) * 100),
      credit: Math.round((l.credit || 0) * 100),
      note: l.note ?? null,
    }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("amend_journal", {
    p_id: id,
    p_lines: payload,
    p_narration: narration || null,
    p_date: entryDate || null,
    p_reason: reason,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.journals);
  revalidatePath(ROUTES.trialBalance);
  return ok(String(data));
}

export async function saveLedgerAccount(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_ledger_account", {
    p_id: String(formData.get("id") ?? "") || null,
    p_code: String(formData.get("code") ?? ""),
    p_name: String(formData.get("name") ?? ""),
    p_kind: String(formData.get("kind") ?? ""),
    p_is_expense_category: formData.get("isExpenseCategory") === "on",
    p_active: formData.get("active") !== null ? formData.get("active") === "on" : true,
    p_note: String(formData.get("note") ?? "") || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.accounts);
  revalidatePath(ROUTES.expenses);
  return ok(undefined);
}

export async function saveTaxRateRow(formData: FormData): Promise<Result> {
  const pct = Number(formData.get("percent") ?? 0);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return err("Enter a valid percentage.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_tax_rate", {
    p_id: String(formData.get("id") ?? "") || null,
    p_name: String(formData.get("name") ?? ""),
    p_bps: Math.round(pct * 100),
    p_hsn: String(formData.get("hsnCode") ?? "") || null,
    p_applies: String(formData.get("appliesTo") ?? "both"),
    p_default: formData.get("isDefault") === "on",
    p_active: formData.get("active") !== null ? formData.get("active") === "on" : true,
    p_note: String(formData.get("note") ?? "") || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.taxRates);
  return ok(undefined);
}
