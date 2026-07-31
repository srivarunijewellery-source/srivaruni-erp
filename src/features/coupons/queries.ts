import { createClient } from "@/lib/supabase/server";

export interface CouponBatch {
  id: string;
  name: string;
  prefix: string;
  discountKind: "percent" | "amount";
  discountBps: number | null;
  discountPaise: number | null;
  minPurchasePaise: number;
  validFrom: string;
  validTo: string;
  total: number;
  available: number;
  assigned: number;
  redeemed: number;
  voided: number;
  live: boolean;
  expired: boolean;
  notes: string | null;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  serial: number;
  status: "available" | "assigned" | "redeemed" | "void";
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  assignedAt: string | null;
  voidReason: string | null;
}

export async function listCouponBatches(): Promise<CouponBatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupon_batch_summary")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    prefix: b.prefix,
    discountKind: b.discount_kind,
    discountBps: b.discount_bps,
    discountPaise: b.discount_paise === null ? null : Number(b.discount_paise),
    minPurchasePaise: Number(b.min_purchase_paise ?? 0),
    validFrom: b.valid_from,
    validTo: b.valid_to,
    total: Number(b.total ?? 0),
    available: Number(b.available ?? 0),
    assigned: Number(b.assigned ?? 0),
    redeemed: Number(b.redeemed ?? 0),
    voided: Number(b.voided ?? 0),
    live: Boolean(b.live),
    expired: Boolean(b.expired),
    notes: b.notes,
    createdAt: b.created_at,
  }));
}

export async function getCouponBatch(id: string): Promise<CouponBatch | null> {
  const batches = await listCouponBatches();
  return batches.find((b) => b.id === id) ?? null;
}

export async function listCoupons(batchId: string): Promise<Coupon[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .select(`id, code, serial, status, customer_id, assigned_at, void_reason,
             customers(name, phone)`)
    .eq("batch_id", batchId)
    .order("serial");
  if (error) throw error;

  return (data ?? []).map((c) => {
    const cust = Array.isArray(c.customers) ? c.customers[0] : c.customers;
    return {
      id: c.id,
      code: c.code,
      serial: c.serial,
      status: c.status,
      customerId: c.customer_id,
      customerName: cust?.name ?? null,
      customerPhone: cust?.phone ?? null,
      assignedAt: c.assigned_at,
      voidReason: c.void_reason,
    };
  });
}

/** Coupons held by one person, for their detail page. */
export async function listCustomerCoupons(customerId: string): Promise<
  Array<Coupon & { batchName: string; validTo: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupons")
    .select(`id, code, serial, status, customer_id, assigned_at, void_reason,
             coupon_batches(name, valid_to)`)
    .eq("customer_id", customerId)
    .order("assigned_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((c) => {
    const b = Array.isArray(c.coupon_batches) ? c.coupon_batches[0] : c.coupon_batches;
    return {
      id: c.id,
      code: c.code,
      serial: c.serial,
      status: c.status,
      customerId: c.customer_id,
      customerName: null,
      customerPhone: null,
      assignedAt: c.assigned_at,
      voidReason: c.void_reason,
      batchName: b?.name ?? "",
      validTo: b?.valid_to ?? "",
    };
  });
}
