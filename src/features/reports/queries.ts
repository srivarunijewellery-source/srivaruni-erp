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

/**
 * Runs a report and returns EVERY row, not the first page of them.
 *
 * run_report will happily return four thousand rows, but PostgREST caps
 * what it will serialise in one response (Supabase ships a `db-max-rows`
 * default). The cap is silent: the request succeeds, the CSV downloads,
 * and the count is simply wrong — which is the worst possible failure
 * for a stock report someone is about to act on.
 *
 * So the rows are pulled in pages with `.range()` until a short page
 * comes back. That makes the result independent of whatever the server
 * cap happens to be, rather than guessing a number that matches it.
 */
export async function runReport(
  key: string,
  from: string,
  to: string,
  location: string | null,
  limit = 20000,
): Promise<ReportRow[]> {
  const supabase = await createClient();
  const PAGE = 1000;
  const rows: ReportRow[] = [];

  for (let offset = 0; offset < limit; offset += PAGE) {
    const { data, error } = await supabase
      .rpc("run_report", {
        p_key: key,
        p_from: from,
        p_to: to,
        p_location: location,
        p_limit: limit,
      })
      .range(offset, offset + PAGE - 1);

    // Reported rather than swallowed: returning [] on error made an
    // empty report indistinguishable from a broken one.
    if (error) {
      console.error(`Report ${key} failed at offset ${offset}:`, error.message);
      break;
    }

    const page = (data ?? []) as ReportRow[];
    rows.push(...page);
    // A short page is the last page.
    if (page.length < PAGE) break;
  }

  return rows;
}
