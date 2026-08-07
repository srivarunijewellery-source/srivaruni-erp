import { createClient } from "@/lib/supabase/server";

export interface BillDetailLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  barcode: string | null;
  qty: number;
  unitPricePaise: number;
  discountPaise: number;
  lineTotalPaise: number;
  photoPath: string | null;
  returnedQty: number;
}

export interface BillDetail {
  id: string;
  billNo: string;
  billDate: string;
  status: string;
  paymentMode: string | null;
  grossPaise: number;
  discountPaise: number;
  manualDiscountPaise: number;
  schemeDiscountPaise: number;
  couponDiscountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  note: string | null;
  editReason: string | null;
  replacesBillId: string | null;
  replacesNo: string | null;
  replacedByBillId: string | null;
  replacedByNo: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  locationCode: string | null;
  locationName: string | null;
  soldByName: string | null;
  sessionStatus: string | null;
  terminal: string | null;
  lines: BillDetailLine[];
  payments: Array<{ method: string; amountPaise: number; reference: string | null }>;
  gifts: Array<{ offerName: string; qty: number; itemName: string | null }>;
  returns: Array<{
    id: string;
    returnNo: string;
    returnDate: string;
    totalPaise: number;
    creditNoteNo: string | null;
  }>;
}

export async function getBillDetail(id: string): Promise<BillDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bill_detail", { p_bill: id });
  if (error || !data) return null;

  const d = data as Record<string, unknown>;
  const b = d.bill as Record<string, unknown> | null;
  if (!b) return null;

  const num = (v: unknown) => Number(v ?? 0);
  const str = (v: unknown) => (v ? String(v) : null);

  return {
    id: String(b.id),
    billNo: String(b.bill_no),
    billDate: String(b.bill_date),
    status: String(b.status),
    paymentMode: str(b.payment_mode),
    grossPaise: num(b.gross_paise),
    discountPaise: num(b.discount_paise),
    manualDiscountPaise: num(b.manual_discount_paise),
    schemeDiscountPaise: num(b.scheme_discount_paise),
    couponDiscountPaise: num(b.coupon_discount_paise),
    taxablePaise: num(b.taxable_paise),
    cgstPaise: num(b.cgst_paise),
    sgstPaise: num(b.sgst_paise),
    igstPaise: num(b.igst_paise),
    totalPaise: num(b.total_paise),
    note: str(b.note),
    editReason: str(b.edit_reason),
    replacesBillId: str(b.replaces_bill_id),
    replacesNo: str(b.replaces_no),
    replacedByBillId: str(b.replaced_by_bill_id),
    replacedByNo: str(b.replaced_by_no),
    customerId: str(b.customer_id),
    customerName: str(b.customer_name),
    customerPhone: str(b.customer_phone),
    locationCode: str(b.location_code),
    locationName: str(b.location_name),
    soldByName: str(b.sold_by_name),
    sessionStatus: str(b.session_status),
    terminal: str(b.terminal),
    lines: ((d.lines ?? []) as Array<Record<string, unknown>>).map((l) => ({
      id: String(l.id),
      lineNo: num(l.line_no),
      itemId: String(l.item_id),
      itemName: String(l.item_name ?? "Item"),
      barcode: str(l.barcode),
      qty: num(l.qty),
      unitPricePaise: num(l.unit_price_paise),
      discountPaise: num(l.discount_paise),
      lineTotalPaise: num(l.line_total_paise),
      photoPath: str(l.photo_path),
      returnedQty: num(l.returned_qty),
    })),
    payments: ((d.payments ?? []) as Array<Record<string, unknown>>).map((p) => ({
      method: String(p.method),
      amountPaise: num(p.amount_paise),
      reference: str(p.reference),
    })),
    gifts: ((d.gifts ?? []) as Array<Record<string, unknown>>).map((g) => ({
      offerName: String(g.offer_name ?? "Gift"),
      qty: num(g.qty),
      itemName: str(g.item_name),
    })),
    returns: ((d.returns ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      returnNo: String(r.return_no),
      returnDate: String(r.return_date),
      totalPaise: num(r.total_paise),
      creditNoteNo: str(r.credit_note_no),
    })),
  };
}
