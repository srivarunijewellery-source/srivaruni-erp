import type { Metadata } from "next";
import { requireUser } from "@/features/auth/session";
import { can } from "@/config/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { listLeave, listStaff } from "@/features/staff/queries";
import { LeaveBoard } from "@/features/staff/LeaveBoard";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage() {
  const user = await requireUser();

  const [requests, staff] = await Promise.all([
    listLeave("all"),
    can(user, "staff.view") ? listStaff(false) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Leave"
        description="Requests and decisions. Approving fills the register for those days."
      />
      <LeaveBoard
        requests={requests}
        staff={staff.length > 0 ? staff : []}
        canDecide={can(user, "leave.approve")}
        currentStaffId={user.staffId}
      />
    </>
  );
}
