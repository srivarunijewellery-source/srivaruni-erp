"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

export interface BooksGap {
  docNo: string;
  vendorName: string;
  postedPaise: number;
  shouldBePaise: number;
  gapPaise: number;
  paidPaise: number;
}

/**
 * Where an approved inward's books have fallen behind the document.
 *
 * inward_autopost fires ONLY on the transition into approved:
 *
 *     if TG_OP = 'UPDATE' and old.status = 'approved' then return new;
 *
 * so anything that recomputes costs afterwards -- a vendor changed, a
 * freight line added, a quantity corrected -- moves the document without
 * moving the journal. Nothing else in the system notices, which is how
 * eight documents came to be posted at a total of about Rs2,700 less
 * than they are worth with nobody aware of it.
 *
 * Returns null when they agree, so the caller can render nothing at all
 * on the overwhelming majority of documents.
 */
export async function getBooksGap(inwardId: string): Promise<BooksGap | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inward_books_gap")
    .select("doc_no, vendor_name, posted_paise, should_be_paise, gap_paise, paid_paise")
    .eq("inward_id", inwardId)
    .maybeSingle();

  // The view is security_invoker, so staff see nothing here and the
  // caller simply renders no banner.
  if (error || !data) return null;
  if (Number(data.gap_paise) === 0) return null;

  return {
    docNo: String(data.doc_no),
    vendorName: String(data.vendor_name),
    postedPaise: Number(data.posted_paise),
    shouldBePaise: Number(data.should_be_paise),
    gapPaise: Number(data.gap_paise),
    paidPaise: Number(data.paid_paise),
  };
}

export interface CorrectionPosted {
  docNo: string;
  wasPaise: number;
  nowPaise: number;
  gapPaise: number;
}

/**
 * Brings the books into line with the document.
 *
 * Posts the DIFFERENCE, dated today, and leaves the original entry
 * exactly where it is. Reversing and re-posting would be tidier to look
 * at and worse to audit: the purchase happened on its date, the
 * correction happened on today's, and a ledger that quietly rewrites the
 * first to match the second cannot be checked against anything.
 *
 * Refused once any payment has been allocated. A payment has been
 * reconciled against a figure, and moving the bill underneath it breaks
 * that reconciliation -- that difference belongs in a debit or credit
 * note with the vendor, which is a conversation, not a repost.
 *
 * Deliberately one document at a time and never automatic. Every one of
 * these gaps has a story behind it, and posting eight of them in a batch
 * would bury eight stories under one button.
 */
export async function postBooksCorrection(
  inwardId: string,
  reason: string,
): Promise<Result<CorrectionPosted | null>> {
  const why = reason.trim();
  if (!why) {
    return err("Say what is being corrected — the narration is all anyone reading the ledger will have.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_inward_payable_correction", {
    p_inward: inwardId,
    p_reason: why,
  });

  if (error) return err(toMessage(error));

  const r = data as Record<string, unknown> | null;
  if (!r || r.changed !== true) return ok(null);

  revalidatePath(ROUTES.inwardDetail(inwardId));
  revalidatePath("/accounts");

  return ok({
    docNo: String(r.doc_no ?? ""),
    wasPaise: Number(r.was_paise ?? 0),
    nowPaise: Number(r.now_paise ?? 0),
    gapPaise: Number(r.gap_paise ?? 0),
  });
}
