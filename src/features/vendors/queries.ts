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
       payment_terms_days, active`,
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
  }));
}
