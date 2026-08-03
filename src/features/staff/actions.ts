"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/config/nav";
import { err, ok, toMessage, type Result } from "@/lib/result";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const staffSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "A name is required."),
  role: z.enum(["owner", "manager", "staff"]),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("That email does not look right.").optional().or(z.literal("")),
  employeeCode: z.string().trim().optional(),
  locationId: z.string().uuid().optional().or(z.literal("")),
  dob: z.string().regex(DATE).optional().or(z.literal("")),
  joinedOn: z.string().regex(DATE).optional().or(z.literal("")),
  address: z.string().trim().optional(),
  emergencyName: z.string().trim().optional(),
  emergencyPhone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  active: z.string().optional(),
});

export async function saveStaff(formData: FormData): Promise<Result<string>> {
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_staff", {
    p_id: v.id || null,
    p_name: v.name,
    p_role: v.role,
    p_phone: v.phone || null,
    p_email: v.email || null,
    p_employee_code: v.employeeCode || null,
    p_location: v.locationId || null,
    p_dob: v.dob || null,
    p_joined_on: v.joinedOn || null,
    p_address: v.address || null,
    p_emergency_name: v.emergencyName || null,
    p_emergency_phone: v.emergencyPhone || null,
    p_notes: v.notes || null,
    p_active: v.active === "on" || v.active === "true",
  });

  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.staff);
  if (v.id) revalidatePath(ROUTES.staffDetail(v.id));
  return ok(String(data));
}

export async function markAttendance(formData: FormData): Promise<Result> {
  const staffId = String(formData.get("staffId") ?? "");
  const onDate = String(formData.get("onDate") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!staffId || !onDate || !status) return err("Missing details.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_attendance", {
    p_staff: staffId,
    p_date: onDate,
    p_status: status,
    p_check_in: String(formData.get("checkIn") ?? "") || null,
    p_check_out: String(formData.get("checkOut") ?? "") || null,
    p_location: String(formData.get("locationId") ?? "") || null,
    p_note: String(formData.get("note") ?? "") || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.attendance);
  revalidatePath(ROUTES.staffDetail(staffId));
  return ok(undefined);
}

export interface RegisterRow {
  staff_id: string;
  status: string;
  check_in?: string;
  check_out?: string;
  location_id?: string;
  note?: string;
}

/** The whole day in one call, so a failure leaves no half-filled register. */
export async function saveRegister(
  onDate: string,
  rows: RegisterRow[],
): Promise<Result<number>> {
  if (!onDate) return err("Pick a date.");
  if (rows.length === 0) return err("Nothing to save.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_mark_attendance", {
    p_date: onDate,
    p_rows: rows,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.attendance);
  return ok(Number(data ?? 0));
}

export async function requestLeave(formData: FormData): Promise<Result> {
  const staffId = String(formData.get("staffId") ?? "");
  const from = String(formData.get("fromDate") ?? "");
  const to = String(formData.get("toDate") ?? "");
  if (!staffId || !DATE.test(from) || !DATE.test(to)) return err("Pick both dates.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_leave", {
    p_staff: staffId,
    p_from: from,
    p_to: to,
    p_kind: String(formData.get("kind") ?? "casual"),
    p_reason: String(formData.get("reason") ?? "") || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.leave);
  return ok(undefined);
}

export async function decideLeave(formData: FormData): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) return err("Missing details.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_leave", {
    p_id: id,
    p_status: status,
    p_note: String(formData.get("note") ?? "") || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.leave);
  revalidatePath(ROUTES.attendance);
  return ok(undefined);
}

export async function saveCompensation(formData: FormData): Promise<Result> {
  const staffId = String(formData.get("staffId") ?? "");
  const from = String(formData.get("effectiveFrom") ?? "");
  const rupees = Number(formData.get("ctcRupees") ?? 0);
  if (!staffId || !DATE.test(from)) return err("Pick an effective date.");
  if (!Number.isFinite(rupees) || rupees < 0) return err("Enter a valid amount.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_compensation", {
    p_staff: staffId,
    p_from: from,
    p_ctc_paise: Math.round(rupees * 100),
    p_incentive_bps: Math.round(Number(formData.get("incentivePct") ?? 0) * 100),
    p_note: String(formData.get("note") ?? "") || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.staffDetail(staffId));
  return ok(undefined);
}

export async function saveTarget(formData: FormData): Promise<Result> {
  const staffId = String(formData.get("staffId") ?? "");
  const month = String(formData.get("month") ?? "");
  const rupees = Number(formData.get("targetRupees") ?? 0);
  if (!staffId || !month) return err("Pick a month.");
  if (!Number.isFinite(rupees) || rupees < 0) return err("Enter a valid target.");

  // <input type="month"> gives YYYY-MM; the function needs a real date.
  const monthDate = month.length === 7 ? `${month}-01` : month;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_target", {
    p_staff: staffId,
    p_month: monthDate,
    p_target_paise: Math.round(rupees * 100),
    p_incentive_bps: Math.round(Number(formData.get("incentivePct") ?? 0) * 100),
    p_note: String(formData.get("note") ?? "") || null,
  });
  if (error) return err(toMessage(error));

  revalidatePath(ROUTES.staffDetail(staffId));
  revalidatePath(ROUTES.performance);
  return ok(undefined);
}
