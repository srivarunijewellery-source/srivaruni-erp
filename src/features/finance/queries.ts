import { createClient } from "@/lib/supabase/server";

export interface FinanceSummary {
  cashPaise: number;
  bankPaise: number;
  inventoryPaise: number;
  gstPayablePaise: number;
  customerCreditPaise: number;
  salesPaise: number;
  bills: number;
  cogsPaise: number;
  expensesPaise: number;
  returnsPaise: number;
  stockPieces: number;
}

export async function getFinanceSummary(
  from: string,
  to: string,
  location: string | null,
): Promise<FinanceSummary> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("finance_summary", {
    p_from: from,
    p_to: to,
    p_location: location,
  });
  const d = (data ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(d[k] ?? 0);
  return {
    cashPaise: n("cash_paise"),
    bankPaise: n("bank_paise"),
    inventoryPaise: n("inventory_paise"),
    gstPayablePaise: n("gst_payable_paise"),
    customerCreditPaise: n("customer_credit_paise"),
    salesPaise: n("sales_paise"),
    bills: n("bills"),
    cogsPaise: n("cogs_paise"),
    expensesPaise: n("expenses_paise"),
    returnsPaise: n("returns_paise"),
    stockPieces: n("stock_pieces"),
  };
}

export interface DailyPoint {
  day: string;
  valuePaise: number;
  count: number;
}

export async function getFinanceDaily(
  metric: string,
  from: string,
  to: string,
  location: string | null,
): Promise<DailyPoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_daily", {
    p_metric: metric,
    p_from: from,
    p_to: to,
    p_location: location,
  });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    day: String(r.day),
    valuePaise: Number(r.value_paise ?? 0),
    count: Number(r.count_n ?? 0),
  }));
}

export interface DayDetailRow {
  id: string;
  ref: string;
  label: string;
  party: string;
  valuePaise: number;
  kind: string;
}

export async function getFinanceDayDetail(
  metric: string,
  day: string,
  location: string | null,
): Promise<DayDetailRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_day_detail", {
    p_metric: metric,
    p_day: day,
    p_location: location,
  });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    ref: String(r.ref ?? ""),
    label: String(r.label ?? ""),
    party: String(r.party ?? ""),
    valuePaise: Number(r.value_paise ?? 0),
    kind: String(r.kind ?? ""),
  }));
}
