"use server";

import { createClient } from "@/lib/supabase/server";
import { err, ok, toMessage, type Result } from "@/lib/result";
import { getPrintConfig } from "@/features/print/queries";
import { formatDate } from "@/lib/format";
import type { ReceiptData } from "./receipt";

/**
 * Rebuilds a printable receipt from a bill that was rung earlier.
 *
 * The counter screen could only reprint the slip still sitting in its
 * own memory — the last sale, on that machine, in that session. Anything
 * older, or rung at the other branch, or after a refresh, could not be
 * reprinted at all. A customer coming back for a duplicate had to be
 * turned away.
 *
 * So this reads the bill back out of the database rather than replaying
 * anything cached. Everything comes from stored values: the printed
 * duplicate is the invoice as it was recorded, not as it is remembered.
 *
 * The print settings are read live, so a duplicate uses today's paper
 * and font settings rather than whatever was configured months ago.
 */
export async function loadReceiptForReprint(
  billId: string,
): Promise<Result<ReceiptData>> {
  try {
    const supabase = await createClient();

    const { data: bill, error } = await supabase
      .from("bills")
      .select(
        `id, bill_no, bill_date, status, gross_paise, discount_paise,
         taxable_paise, tax_paise, cgst_paise, sgst_paise, igst_paise,
         round_off_paise, total_paise, sold_by,
         locations:location_id(name, code, address, phone, gstin),
         customers:customer_id(name, phone, gstin),
         staff:sold_by(name),
         bill_lines(qty, unit_price_paise, discount_paise, line_total_paise,
                    line_no, items(name, barcode), seller:sold_by(name)),
         bill_payments(method, amount_paise, reference),
         bill_gifts(offer_name, qty, items(name))`,
      )
      .eq("id", billId)
      .maybeSingle();

    // RLS returns nothing for another branch's bill, so "not found" and
    // "not yours" are deliberately the same answer.
    if (error) return err(toMessage(error));
    if (!bill) return err("That invoice could not be found.");

    const one = <T,>(v: T | T[] | null): T | undefined =>
      Array.isArray(v) ? v[0] : (v ?? undefined);

    const loc = one(bill.locations) as
      | { name: string; code: string; address: string | null; phone: string | null; gstin: string | null }
      | undefined;
    const cust = one(bill.customers) as
      | { name: string; phone: string | null; gstin: string | null }
      | undefined;

    const [{ data: biz }, printConfig] = await Promise.all([
      supabase
        .from("business_settings")
        .select("legal_name, gstin, invoice_terms, invoice_footer")
        .maybeSingle(),
      getPrintConfig(),
    ]);

    const rawLines = (bill.bill_lines ?? []) as Array<{
      qty: number;
      unit_price_paise: number;
      discount_paise: number;
      line_total_paise: number;
      line_no: number | null;
      items: { name: string; barcode: string } | { name: string; barcode: string }[] | null;
      seller: { name: string } | { name: string }[] | null;
    }>;

    const lines = [...rawLines]
      .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
      .map((l) => {
        const item = one(l.items);
        return {
          name: item?.name ?? "Item",
          qty: l.qty,
          unitPaise: l.unit_price_paise,
          discountPaise: l.discount_paise,
          totalPaise: l.line_total_paise,
        };
      });

    // Everyone credited on the invoice, joined into one line — the same
    // rule the original slip uses. The cashier is not printed; the
    // customer only cares who served them.
    const sellers = [
      ...new Set(
        rawLines
          .map((l) => one(l.seller)?.name)
          .filter((n): n is string => Boolean(n)),
      ),
    ];
    const billSeller = one(bill.staff) as { name: string } | undefined;
    const staffName =
      sellers.length > 0 ? sellers.join(", ") : (billSeller?.name ?? "");

    return ok({
      print: printConfig,
      shopName: biz?.legal_name ?? "Sri Varuni Fashion Jewellery",
      gstin: loc?.gstin ?? biz?.gstin ?? null,
      locationName: loc?.name ?? loc?.code ?? "",
      branchAddress: loc?.address ?? null,
      branchPhone: loc?.phone ?? null,
      billNo: bill.bill_no,
      dateText: formatDate(bill.bill_date),
      staffName,
      customerName: cust?.name ?? null,
      customerPhone: cust?.phone ?? null,
      customerGstin: cust?.gstin ?? null,
      lines,
      grossPaise: bill.gross_paise ?? 0,
      discountPaise: bill.discount_paise ?? 0,
      taxablePaise: bill.taxable_paise ?? 0,
      cgstPaise: bill.cgst_paise ?? 0,
      sgstPaise: bill.sgst_paise ?? 0,
      igstPaise: bill.igst_paise ?? 0,
      roundOffPaise: bill.round_off_paise ?? 0,
      // From bill_gifts, so a duplicate shows what was actually handed
      // over rather than what the offer rules would award today.
      gifts: ((bill.bill_gifts ?? []) as Array<{
        offer_name: string;
        qty: number;
        items: { name: string } | { name: string }[] | null;
      }>).map((g) => ({
        name: g.offer_name,
        itemName: one(g.items)?.name ?? g.offer_name,
        qty: Number(g.qty ?? 1),
      })),
      totalPaise: bill.total_paise ?? 0,
      payments: (bill.bill_payments ?? []) as ReceiptData["payments"],
      terms: biz?.invoice_terms ?? null,
      // A duplicate says so. An unmarked second copy of a tax invoice is
      // the kind of thing that causes an argument later.
      footer:
        bill.status === "cancelled"
          ? "CANCELLED — not a valid invoice"
          : `Duplicate copy · ${biz?.invoice_footer ?? "Thank you, do visit again"}`,
    });
  } catch (e) {
    return err(toMessage(e, "That invoice could not be prepared for printing."));
  }
}
