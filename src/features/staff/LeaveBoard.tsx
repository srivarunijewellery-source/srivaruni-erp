"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, pluralise } from "@/lib/format";
import { LEAVE_KINDS } from "./constants";
import { requestLeave, decideLeave } from "./actions";
import type { LeaveRequest, StaffMember } from "./queries";
import { todayIso } from "@/lib/dates";

const STATUS_TONE = {
  pending: "pending",
  approved: "done",
  rejected: "danger",
  cancelled: "neutral",
} as const;

const today = () => todayIso();

export function LeaveBoard({
  requests,
  staff,
  canDecide,
  currentStaffId,
}: {
  requests: LeaveRequest[];
  staff: StaffMember[];
  canDecide: boolean;
  currentStaffId: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  function apply(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await requestLeave(formData);
      if (r.ok) setApplying(false);
      else setError(r.error);
    });
  }

  function decide(id: string, status: string) {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("id", id);
      fd.set("status", status);
      const r = await decideLeave(fd);
      if (!r.ok) setError(r.error);
    });
  }

  const pendingList = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="font-medium">
            {pendingList.length > 0
              ? `${pendingList.length} waiting on a decision`
              : "Nothing waiting"}
          </span>
          <Button
            variant={applying ? "ghost" : "primary"}
            onClick={() => {
              setApplying(!applying);
              setError(null);
            }}
          >
            {applying ? "Cancel" : "Apply for leave"}
          </Button>
        </CardHeader>

        {applying && (
          <CardBody>
            <form action={apply} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <Label htmlFor="staffId">Who</Label>
                  <Select id="staffId" name="staffId" defaultValue={currentStaffId}>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="fromDate">From</Label>
                  <Input id="fromDate" name="fromDate" type="date" defaultValue={today()} required />
                </div>
                <div>
                  <Label htmlFor="toDate">Until</Label>
                  <Input id="toDate" name="toDate" type="date" defaultValue={today()} required />
                </div>
                <div>
                  <Label htmlFor="kind">Kind</Label>
                  <Select id="kind" name="kind" defaultValue="casual">
                    {LEAVE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="reason">Reason</Label>
                <Input id="reason" name="reason" placeholder="Family function" />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send request"}
              </Button>
              <p className="text-2xs text-text-muted">
                Approving a request fills the register for those days automatically,
                so nobody gets marked absent for leave they were granted.
              </p>
            </form>
          </CardBody>
        )}
      </Card>

      <FieldError>{error}</FieldError>

      {requests.length === 0 ? (
        <EmptyState title="No leave has been applied for yet" />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {[...pendingList, ...decided].map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-48 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.staffName}</span>
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                      <span className="text-2xs text-text-muted">{r.kind}</span>
                    </div>
                    <p className="mt-0.5 text-2xs text-text-muted">
                      {formatDate(r.fromDate)} – {formatDate(r.toDate)} ·{" "}
                      {pluralise(r.days, "day")}
                      {r.reason ? ` · ${r.reason}` : ""}
                      {r.decidedByName ? ` · by ${r.decidedByName}` : ""}
                    </p>
                  </div>

                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      {canDecide && (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={pending}
                            onClick={() => decide(r.id, "approved")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={pending}
                            onClick={() => decide(r.id, "rejected")}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {r.staffId === currentStaffId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => decide(r.id, "cancelled")}
                        >
                          Withdraw
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
