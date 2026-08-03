/**
 * Client-safe constants.
 *
 * These used to live in queries.ts. Importing a VALUE from that module
 * dragged `next/headers` into the client bundle through the Supabase
 * server client and broke the build — type-only imports are erased,
 * value imports are not. Anything a client component needs at runtime
 * belongs here instead.
 */

export type AttendanceStatus =
  | "present"
  | "half_day"
  | "absent"
  | "leave"
  | "week_off"
  | "holiday";

export const ATTENDANCE_STATUSES: ReadonlyArray<{
  value: AttendanceStatus;
  label: string;
}> = [
  { value: "present",  label: "Present" },
  { value: "half_day", label: "Half day" },
  { value: "absent",   label: "Absent" },
  { value: "leave",    label: "Leave" },
  { value: "week_off", label: "Week off" },
  { value: "holiday",  label: "Holiday" },
] as const;

export const LEAVE_KINDS = [
  { value: "casual",   label: "Casual" },
  { value: "sick",     label: "Sick" },
  { value: "unpaid",   label: "Unpaid" },
  { value: "comp_off", label: "Comp off" },
] as const;
