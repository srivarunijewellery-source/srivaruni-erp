import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { can, isOwner } from "@/config/roles";
import { ROUTES } from "@/config/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Fact } from "@/components/ui/DetailShell";
import { formatDate } from "@/lib/format";
import {
  getAttendanceHistory,
  getCompensation,
  getStaff,
  getTargets,
  listLeave, getStaffLoginEmail } from "@/features/staff/queries";
import { PayPanel } from "@/features/staff/PerformancePanels";
import { LoginPanel } from "@/features/staff/LoginPanel";
import { RolePanel } from "@/features/staff/RolePanel";
import { listRoles } from "@/features/roles/queries";
import { isoOf, todayIso } from "@/lib/dates";

export const metadata: Metadata = { title: "Team member" };

const STATUS_TONE = {
  present: "done",
  half_day: "pending",
  absent: "danger",
  leave: "transit",
  week_off: "neutral",
  holiday: "neutral",
} as const;

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "staff.view")) {
    return <EmptyState title="The team pages are for managers and the owner" />;
  }

  const { id } = await params;
  const member = await getStaff(id);
  if (!member) notFound();

  const from = new Date();
  from.setDate(from.getDate() - 45);
  const fromIso = isoOf(from);
  const toIso = todayIso();

  const [history, leave, compensation, targets, roles] = await Promise.all([
    getAttendanceHistory(id, fromIso, toIso),
    listLeave("all", id),
    getCompensation(id),
    getTargets(id),
    can(user, "roles.manage") ? listRoles() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={member.name}
        description={[member.role, member.locationCode, member.employeeCode]
          .filter(Boolean)
          .join(" · ")}
        crumbs={[{ label: "Staff", href: ROUTES.staff }, { label: member.name }]}
      />

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <span className="font-medium">Details</span>
            {!member.active && <Badge tone="danger">No longer working here</Badge>}
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Fact label="Phone" value={member.phone ?? "—"} />
            <Fact
              label="Email"
              value={
                member.email ?? (
                  <span className="text-status-pending-fg">
                    not set — alerts cannot reach them
                  </span>
                )
              }
            />
            <Fact label="Joined" value={member.joinedOn ? formatDate(member.joinedOn) : "—"} />
            <Fact label="Date of birth" value={member.dob ? formatDate(member.dob) : "—"} />
            <Fact
              label="Emergency contact"
              value={
                member.emergencyName
                  ? `${member.emergencyName}${member.emergencyPhone ? ` · ${member.emergencyPhone}` : ""}`
                  : "—"
              }
            />
            <Fact label="Login" value={member.hasLogin ? "Linked" : "Not linked"} />
            {member.address && <Fact label="Address" value={member.address} />}
            {member.notes && <Fact label="Notes" value={member.notes} />}
          </CardBody>
        </Card>

        {isOwner(user.role) && (
          <LoginPanel
            member={member}
            loginEmail={await getStaffLoginEmail(member.id)}
            configured={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}
          />
        )}

        {can(user, "roles.manage") && (
          <RolePanel
            staffId={member.id}
            currentRoleId={member.roleId}
            currentRoleName={member.roleName}
            roles={roles}
          />
        )}

        <PayPanel
          staffId={member.id}
          compensation={compensation}
          targets={targets}
          canEdit={isOwner(user.role)}
        />

        <Card>
          <CardHeader className="font-medium">Last 45 days</CardHeader>
          <CardBody className="p-0">
            {history.length === 0 ? (
              <p className="px-4 py-6 text-sm text-text-muted">Nothing marked yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((d) => (
                  <li
                    key={d.onDate}
                    className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                  >
                    <span>{formatDate(d.onDate)}</span>
                    <span className="flex items-center gap-3">
                      {d.checkIn && (
                        <span className="font-mono text-2xs text-text-muted">
                          {d.checkIn.slice(0, 5)}
                          {d.checkOut ? `–${d.checkOut.slice(0, 5)}` : ""}
                        </span>
                      )}
                      {d.note && <span className="text-2xs text-text-muted">{d.note}</span>}
                      <Badge tone={STATUS_TONE[d.status]}>{d.status.replace("_", " ")}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="font-medium">Leave</CardHeader>
          <CardBody className="p-0">
            {leave.length === 0 ? (
              <p className="px-4 py-6 text-sm text-text-muted">No leave applied for.</p>
            ) : (
              <ul className="divide-y divide-border">
                {leave.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                  >
                    <span>
                      {formatDate(l.fromDate)} – {formatDate(l.toDate)}
                      <span className="ml-2 text-2xs text-text-muted">{l.kind}</span>
                    </span>
                    <Badge
                      tone={
                        l.status === "approved"
                          ? "done"
                          : l.status === "rejected"
                            ? "danger"
                            : l.status === "pending"
                              ? "pending"
                              : "neutral"
                      }
                    >
                      {l.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
