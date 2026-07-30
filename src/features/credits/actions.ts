"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

/**
 * Vendor credit notes.
 *
 * A credit reduces what is owed without any money moving, so it is
 * deliberately NOT a vendor_payments row: recording it as a payment would
 * net the payable correctly and then break the bank reconciliation.
 *
 * It also leaves landed cost alone. A credit received after the invoice
 * does not reduce taxable value unless s.15(3)(b) conditions are met, so
 * folding it into stock cost would overstate ITC.
 */

const schema = z.object({
  vendorId: z.string().uuid(),
  noteNo: z.string().max(60).nullable().optional(),
  noteDate: z.string().min(1, "Pick the date on the credit note."),
  amountPaise: z.number().int().positive("Enter an amount above zero."),
  reason: z.string().max(300).nullable().optional(),
  /** Optional: apply it straight to a bill, or leave it unapplied. */
  inwardId: z.string().uuid().nullable().optional(),
});

export async function saveCreditNote(input: {
  vendorId: string;
  noteNo: string | null;
  noteDate: string;
  amountPaise: number;
  reason: string | null;
  inwardId: string | null;
}): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Check the credit note.");
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data: note, error: nErr } = await supabase
    .from("vendor_credit_notes")
    .insert({
      vendor_id: v.vendorId,
      note_no: v.noteNo || null,
      note_date: v.noteDate,
      amount_paise: v.amountPaise,
      reason: v.reason || null,
    })
    .select("id")
    .single();

  if (nErr || !note) return err(toMessage(nErr));

  if (v.inwardId) {
    const { error: aErr } = await supabase
      .from("vendor_credit_allocations")
      .insert({
        credit_note_id: note.id,
        inward_id: v.inwardId,
        amount_paise: v.amountPaise,
      });

    // The note is recorded either way; only the allocation failed, and the
    // guard's message says why. Better to keep the credit and report than
    // to lose it because the chosen bill was wrong.
    if (aErr) {
      revalidatePath(ROUTES.vendorDetail(v.vendorId));
      return err(`Credit recorded, but it could not be applied to that bill: ${toMessage(aErr)}`);
    }
  }

  revalidatePath(ROUTES.vendorDetail(v.vendorId));
  revalidatePath(ROUTES.vendors);
  revalidatePath(ROUTES.payments);
  return ok(undefined);
}

/** Apply an existing, unapplied credit to a bill. */
export async function allocateCredit(
  vendorId: string,
  creditNoteId: string,
  inwardId: string,
  amountPaise: number,
): Promise<Result> {
  if (amountPaise <= 0) return err("Enter an amount above zero.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_credit_allocations")
    .insert({ credit_note_id: creditNoteId, inward_id: inwardId, amount_paise: amountPaise });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.vendorDetail(vendorId));
  revalidatePath(ROUTES.payments);
  return ok(undefined);
}
