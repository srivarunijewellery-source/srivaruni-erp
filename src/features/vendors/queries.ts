import type { VendorPricingMode } from "@/types/domain";
import { createClient } from "@/lib/supabase/server";

export type PriceMode = "gst_exclusive" | "gst_inclusive" | "no_gst";
export type GstStatus = "registered" | "composition" | "unregistered";

export interface VendorDetail {
  id: string;
  name: string;
  gstStatus: GstStatus;
  gstin: string | null;
  stateCode: string | null;
  phone: string | null;
  city: string | null;
  placeOfBusiness: string | null;
  priceMode: PriceMode;
  defaultGstRate: number;
  paymentTermsDays: number;
  active: boolean;
  /** How this vendor's prices are read off a product title. */
  pricingMode: VendorPricingMode;
  codeMultiple: number | null;
  codeHasDateSuffix: boolean;
  pricingNote: string | null;
}

/** Full vendor records are manager-and-above by RLS; staff use the
 *  narrow vendor_picklist view instead. */
export async function listVendorDetails(): Promise<VendorDetail[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select(
      `id, name, gst_status, gstin, state_code, phone, city,
       place_of_business, price_mode, default_gst_rate,
       payment_terms_days, active,
       pricing_mode, code_multiple, code_has_date_suffix, pricing_note`,
    )
    .order("name");

  if (error) throw error;
  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    gstStatus: v.gst_status,
    gstin: v.gstin,
    stateCode: v.state_code,
    phone: v.phone,
    city: v.city,
    placeOfBusiness: v.place_of_business,
    priceMode: v.price_mode,
    defaultGstRate: Number(v.default_gst_rate),
    paymentTermsDays: v.payment_terms_days,
    active: v.active,
    pricingMode: v.pricing_mode,
    codeMultiple: v.code_multiple === null ? null : Number(v.code_multiple),
    codeHasDateSuffix: v.code_has_date_suffix,
    pricingNote: v.pricing_note,
  }));
}

export interface VendorPurchase {
  inwardId: string;
  docNo: string;
  status: string;
  invoiceNo: string | null;
  invoiceDate: string | null;
  approvedAt: string | null;
  createdAt: string;
  locationCode: string;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
  pieces: number;
  lines: number;
}

export interface VendorBalance {
  approvedDocs: number;
  purchasedPaise: number;
  paidPaise: number;
  advancePaise: number;
  duePaise: number;
  lastPurchaseAt: string | null;
  /**
   * Credits raised by the vendor. Already netted into duePaise, and
   * deliberately kept out of paidPaise: no money moved, so counting it as
   * paid would invent an advance and break the bank reconciliation.
   */
  creditPaise: number;
  creditUnappliedPaise: number;
}

export async function getVendor(id: string): Promise<VendorDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select(
      `id, name, gst_status, gstin, state_code, phone, city,
       place_of_business, price_mode, default_gst_rate,
       payment_terms_days, active,
       pricing_mode, code_multiple, code_has_date_suffix, pricing_note`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    gstStatus: data.gst_status,
    gstin: data.gstin,
    stateCode: data.state_code,
    phone: data.phone,
    city: data.city,
    placeOfBusiness: data.place_of_business,
    priceMode: data.price_mode,
    defaultGstRate: Number(data.default_gst_rate),
    paymentTermsDays: data.payment_terms_days,
    active: data.active,
    pricingMode: data.pricing_mode,
    codeMultiple: data.code_multiple === null ? null : Number(data.code_multiple),
    codeHasDateSuffix: data.code_has_date_suffix,
    pricingNote: data.pricing_note,
  };
}

/** Owner-only in practice: reads through inward_header_costs. */
export async function getVendorPurchases(id: string): Promise<VendorPurchase[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_purchase_history")
    .select("*")
    .eq("vendor_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return [];
  return (data ?? []).map((r) => ({
    inwardId: r.inward_id,
    docNo: r.doc_no,
    status: r.status,
    invoiceNo: r.vendor_invoice_no,
    invoiceDate: r.vendor_invoice_date,
    approvedAt: r.approved_at,
    createdAt: r.created_at,
    locationCode: r.location_code,
    taxablePaise: r.taxable_paise,
    taxPaise: r.tax_paise,
    totalPaise: r.total_paise,
    pieces: Number(r.pieces ?? 0),
    lines: Number(r.lines ?? 0),
  }));
}

export async function getVendorBalance(id: string): Promise<VendorBalance | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendor_balances")
    .select(
      `approved_docs, purchased_paise, paid_paise, advance_paise, due_paise,
       last_purchase_at, credit_paise, credit_unapplied_paise`,
    )
    .eq("vendor_id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    approvedDocs: Number(data.approved_docs ?? 0),
    purchasedPaise: Number(data.purchased_paise ?? 0),
    paidPaise: Number(data.paid_paise ?? 0),
    advancePaise: Number(data.advance_paise ?? 0),
    duePaise: Number(data.due_paise ?? 0),
    lastPurchaseAt: data.last_purchase_at,
    creditPaise: Number(data.credit_paise ?? 0),
    creditUnappliedPaise: Number(data.credit_unapplied_paise ?? 0),
  };
}

/** Just id and name, for filter dropdowns. */
export async function listVendorOptions(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("active", true)
    .order("name");
  if (error) return [];
  return data ?? [];
}
