import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/domain";

import type { AttendanceStatus } from "./constants";

export type { AttendanceStatus };

export interface StaffMember {
  id: string;
  name: string;
  role: Role;
  phone: string | null;
  email: string | null;
  employeeCode: string | null;
  locationId: string | null;
  locationCode: string | null;
  dob: string | null;
  joinedOn: string | null;
  exitedOn: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  active: boolean;
  hasLogin: boolean;
  roleId: string | null;
  roleName: string;
}

/**
 * `.select()` is one string literal on purpose. Built with `+` the row
 * type collapses to an error type at compile time and every field below
 * silently becomes `any`.
 */
const STAFF_COLUMNS = `id, name, role, phone, email, employee_code, home_location_id,
   dob, joined_on, exited_on, address, emergency_name, emergency_phone, notes,
   active, auth_user_id, role_id, locations:home_location_id(code),
   roles:role_id(name)`;

type StaffRow = {
  id: string;
  name: string;
  role: Role;
  phone: string | null;
  email: string | null;
  employee_code: string | null;
  home_location_id: string | null;
  dob: string | null;
  joined_on: string | null;
  exited_on: string | null;
  address: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  notes: string | null;
  active: boolean;
  auth_user_id: string | null;
  role_id: string | null;
  locations: { code: string } | { code: string }[] | null;
  roles: { name: string } | { name: string }[] | null;
};

function toStaff(r: StaffRow): StaffMember {
  const loc = Array.isArray(r.locations) ? r.locations[0] : r.locations;
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    phone: r.phone,
    email: r.email,
    employeeCode: r.employee_code,
    locationId: r.home_location_id,
    locationCode: loc?.code ?? null,
    dob: r.dob,
    joinedOn: r.joined_on,
    exitedOn: r.exited_on,
    address: r.address,
    emergencyName: r.emergency_name,
    emergencyPhone: r.emergency_phone,
    notes: r.notes,
    active: Boolean(r.active),
    hasLogin: Boolean(r.auth_user_id),
    roleId: r.role_id,
    roleName:
      (Array.isArray(r.roles) ? r.roles[0]?.name : r.roles?.name) ??
      r.role.charAt(0).toUpperCase() + r.role.slice(1),
  };
}

export async function listStaff(includeInactive = false): Promise<StaffMember[]> {
  const supabase = await createClient();
  let q = supabase.from("staff").select(STAFF_COLUMNS).order("name");
  if (!includeInactive) q = q.eq("active", true);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as StaffRow[]).map(toStaff);
}

export async function getStaff(id: string): Promise<StaffMember | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toStaff(data as unknown as StaffRow) : null;
}

export interface AttendanceEntry {
  staffId: string;
  status: AttendanceStatus | null;
  checkIn: string | null;
  checkOut: string | null;
  note: string | null;
  locationId: string | null;
}

/** The register for one day, keyed by staff so the form can index it. */
export async function getAttendanceForDate(
  onDate: string,
): Promise<Map<string, AttendanceEntry>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_attendance")
    .select("staff_id, status, check_in, check_out, note, location_id")
    .eq("on_date", onDate);
  if (error) throw error;

  const map = new Map<string, AttendanceEntry>();
  for (const r of data ?? []) {
    map.set(r.staff_id, {
      staffId: r.staff_id,
      status: r.status as AttendanceStatus,
      checkIn: r.check_in,
      checkOut: r.check_out,
      note: r.note,
      locationId: r.location_id,
    });
  }
  return map;
}

export interface AttendanceDay {
  onDate: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  note: string | null;
}

export async function getAttendanceHistory(
  staffId: string,
  from: string,
  to: string,
): Promise<AttendanceDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_attendance")
    .select("on_date, status, check_in, check_out, note")
    .eq("staff_id", staffId)
    .gte("on_date", from)
    .lte("on_date", to)
    .order("on_date", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    onDate: r.on_date,
    status: r.status as AttendanceStatus,
    checkIn: r.check_in,
    checkOut: r.check_out,
    note: r.note,
  }));
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  fromDate: string;
  toDate: string;
  days: number;
  kind: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export async function listLeave(
  status?: "pending" | "all",
  staffId?: string,
): Promise<LeaveRequest[]> {
  const supabase = await createClient();
  let q = supabase
    .from("staff_leave")
    .select(`id, staff_id, from_date, to_date, kind, reason, status,
             decided_at, decision_note,
             requester:staff_id(name), decider:decided_by(name)`)
    .order("from_date", { ascending: false });

  if (status === "pending") q = q.eq("status", "pending");
  if (staffId) q = q.eq("staff_id", staffId);

  const { data, error } = await q;
  if (error) throw error;

  type Row = {
    id: string; staff_id: string; from_date: string; to_date: string;
    kind: string; reason: string | null; status: LeaveRequest["status"];
    decided_at: string | null; decision_note: string | null;
    requester: { name: string } | { name: string }[] | null;
    decider: { name: string } | { name: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const who = Array.isArray(r.requester) ? r.requester[0] : r.requester;
    const by = Array.isArray(r.decider) ? r.decider[0] : r.decider;
    const days =
      Math.round(
        (Date.parse(r.to_date) - Date.parse(r.from_date)) / 86_400_000,
      ) + 1;
    return {
      id: r.id,
      staffId: r.staff_id,
      staffName: who?.name ?? "Unknown",
      fromDate: r.from_date,
      toDate: r.to_date,
      days,
      kind: r.kind,
      reason: r.reason,
      status: r.status,
      decidedByName: by?.name ?? null,
      decidedAt: r.decided_at,
      decisionNote: r.decision_note,
    };
  });
}

export interface MonthReportRow {
  staffId: string;
  name: string;
  role: Role;
  locationCode: string | null;
  daysPresent: number;
  daysHalf: number;
  daysAbsent: number;
  daysLeave: number;
  daysOff: number;
  daysMarked: number;
  billsCount: number;
  soldPaise: number;
  targetPaise: number | null;
  achievementBps: number | null;
  incentiveBps: number | null;
  incentivePaise: number;
  /** Null for anyone but the owner — RLS, not a UI decision. */
  ctcPaise: number | null;
}

export async function getMonthReport(month: string): Promise<MonthReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_month_report", { p_month: month });
  if (error) throw error;

  type Row = {
    staff_id: string; name: string; role: Role; location_code: string | null;
    days_present: number; days_half: number; days_absent: number;
    days_leave: number; days_off: number; days_marked: number;
    bills_count: number; sold_paise: number; target_paise: number | null;
    achievement_bps: number | null; incentive_bps: number | null;
    incentive_paise: number; ctc_paise: number | null;
  };

  return ((data ?? []) as Row[]).map((r) => ({
    staffId: r.staff_id,
    name: r.name,
    role: r.role,
    locationCode: r.location_code,
    daysPresent: Number(r.days_present ?? 0),
    daysHalf: Number(r.days_half ?? 0),
    daysAbsent: Number(r.days_absent ?? 0),
    daysLeave: Number(r.days_leave ?? 0),
    daysOff: Number(r.days_off ?? 0),
    daysMarked: Number(r.days_marked ?? 0),
    billsCount: Number(r.bills_count ?? 0),
    soldPaise: Number(r.sold_paise ?? 0),
    targetPaise: r.target_paise === null ? null : Number(r.target_paise),
    achievementBps: r.achievement_bps === null ? null : Number(r.achievement_bps),
    incentiveBps: r.incentive_bps === null ? null : Number(r.incentive_bps),
    incentivePaise: Number(r.incentive_paise ?? 0),
    ctcPaise: r.ctc_paise === null ? null : Number(r.ctc_paise),
  }));
}

export interface CompensationRow {
  id: string;
  effectiveFrom: string;
  monthlyCtcPaise: number;
  incentiveBps: number;
  note: string | null;
}

/**
 * Returns an empty list rather than throwing for a manager: RLS filters
 * the rows out, which is a legitimate empty result, not a failure.
 */
export async function getCompensation(staffId: string): Promise<CompensationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_compensation")
    .select("id, effective_from, monthly_ctc_paise, incentive_bps, note")
    .eq("staff_id", staffId)
    .order("effective_from", { ascending: false });
  if (error) return [];

  return (data ?? []).map((r) => ({
    id: r.id,
    effectiveFrom: r.effective_from,
    monthlyCtcPaise: Number(r.monthly_ctc_paise ?? 0),
    incentiveBps: Number(r.incentive_bps ?? 0),
    note: r.note,
  }));
}

export interface TargetRow {
  id: string;
  periodMonth: string;
  targetPaise: number;
  incentiveBps: number;
  note: string | null;
}

export async function getTargets(staffId: string): Promise<TargetRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_targets")
    .select("id, period_month, target_paise, incentive_bps, note")
    .eq("staff_id", staffId)
    .order("period_month", { ascending: false })
    .limit(12);
  if (error) return [];

  return (data ?? []).map((r) => ({
    id: r.id,
    periodMonth: r.period_month,
    targetPaise: Number(r.target_paise ?? 0),
    incentiveBps: Number(r.incentive_bps ?? 0),
    note: r.note,
  }));
}

export async function listLocationOptions(): Promise<
  Array<{ id: string; code: string; name: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("active", true)
    .eq("kind", "store")
    .order("code");
  if (error) throw error;
  return data ?? [];
}
