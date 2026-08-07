"use server";

import { ok, type Result } from "@/lib/result";
import {
  getFinanceDaily,
  getFinanceDayDetail,
  type DailyPoint,
  type DayDetailRow,
} from "./queries";

export async function fetchFinanceDaily(
  metric: string,
  from: string,
  to: string,
  location: string | null,
): Promise<Result<DailyPoint[]>> {
  return ok(await getFinanceDaily(metric, from, to, location));
}

export async function fetchFinanceDayDetail(
  metric: string,
  day: string,
  location: string | null,
): Promise<Result<DayDetailRow[]>> {
  return ok(await getFinanceDayDetail(metric, day, location));
}
