"use server";

import { ok, type Result } from "@/lib/result";
import { runReport, type ReportRow } from "./queries";

export async function fetchReport(
  key: string,
  from: string,
  to: string,
  location: string | null,
): Promise<Result<ReportRow[]>> {
  return ok(await runReport(key, from, to, location, 20000));
}
