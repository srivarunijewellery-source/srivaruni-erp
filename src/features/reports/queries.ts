import { createClient } from "@/lib/supabase/server";

export interface ReportDef {
  key: string;
  group: string;
  label: string;
  desc: string;
  cols: string[];
}

export async function getReportCatalog(): Promise<ReportDef[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_catalog");
  return ((data ?? []) as ReportDef[]).map((r) => ({ ...r }));
}

export type ReportRow = Record<string, unknown>;

export async function runReport(
  key: string,
  from: string,
  to: string,
  location: string | null,
  limit = 5000,
): Promise<ReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_report", {
    p_key: key,
    p_from: from,
    p_to: to,
    p_location: location,
    p_limit: limit,
  });
  if (error) return [];
  return (data ?? []) as ReportRow[];
}
