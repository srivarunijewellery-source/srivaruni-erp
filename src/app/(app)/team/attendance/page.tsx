import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getAttendanceForDate,
  listStaff,
  type AttendanceEntry,
} from "@/features/staff/queries";
import {
  AttendanceRegister,
  RegisterDatePicker,
} from "@/features/staff/AttendanceRegister";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ on?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "attendance.mark")) {
    return <EmptyState title="Only a manager or the owner can fill the register" />;
  }

  const { on } = await searchParams;
  const date =
    on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : new Date().toISOString().slice(0, 10);

  const [staff, existingMap] = await Promise.all([
    listStaff(false),
    getAttendanceForDate(date),
  ]);

  const existing: Record<string, AttendanceEntry> = {};
  for (const [k, v] of existingMap) existing[k] = v;

  return (
    <>
      <PageHeader
        title="Attendance"
        description="One row per person per day. Marking again corrects the day rather than adding a second answer."
        action={<RegisterDatePicker date={date} />}
      />
      <AttendanceRegister
        key={date}
        staff={staff}
        date={date}
        existing={existing}
        canMark={can(user.role, "attendance.mark")}
      />
    </>
  );
}
