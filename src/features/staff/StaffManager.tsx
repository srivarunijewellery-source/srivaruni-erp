"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ROUTES } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { saveStaff } from "./actions";
import type { StaffMember } from "./queries";

const ROLE_TONE = {
  owner: "approved",
  manager: "transit",
  staff: "neutral",
} as const;

export function StaffManager({
  staff,
  locations,
  roles,
  canManage,
  showInactive,
}: {
  staff: StaffMember[];
  locations: Array<{ id: string; code: string; name: string }>;
  roles: Array<{ id: string; name: string; tier: string; active: boolean }>;
  canManage: boolean;
  showInactive: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [adding, setAdding] = useState(false);

  const open = adding || editing !== null;

  function submit(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await saveStaff(formData);
      if (r.ok) {
        setAdding(false);
        setEditing(null);
      } else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {open ? (editing ? `Editing ${editing.name}` : "New team member") : "Team"}
            </span>
            <div className="flex gap-2">
              <Link
                href={`${ROUTES.staff}?inactive=${showInactive ? "0" : "1"}`}
                className="inline-flex h-[var(--control-height)] items-center rounded-control border border-border bg-surface px-3 text-sm shadow-[var(--control-shadow)] transition-colors hover:border-border-strong hover:bg-surface-sunken"
              >
                {showInactive ? "Hide past staff" : "Show past staff"}
              </Link>
              <Button
                variant={open ? "ghost" : "primary"}
                onClick={() => {
                  setAdding(!open);
                  setEditing(null);
                  setError(null);
                }}
              >
                {open ? "Cancel" : "Add person"}
              </Button>
            </div>
          </CardHeader>

          {open && (
            <CardBody>
              <StaffForm
                key={editing?.id ?? "new"}
                member={editing}
                locations={locations}
                roles={roles}
                pending={pending}
                onSubmit={submit}
              />
              <FieldError>{error}</FieldError>
            </CardBody>
          )}
        </Card>
      )}

      {staff.length === 0 ? (
        <EmptyState
          title="Nobody here yet"
          hint="Add the people who work at the counter so attendance and sales have someone to attach to."
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {staff.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={ROUTES.staffDetail(s.id)}
                        className="truncate font-medium hover:text-brand"
                      >
                        {s.name}
                      </Link>
                      <Badge tone={ROLE_TONE[s.role]}>{s.role}</Badge>
                      {!s.active && <Badge tone="danger">Left</Badge>}
                      {!s.hasLogin && (
                        <span
                          className="text-2xs text-text-subtle"
                          title="No login is linked, so this person cannot sign in yet."
                        >
                          no login
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-2xs text-text-muted">
                      {[
                        s.employeeCode,
                        s.locationCode,
                        s.phone,
                        s.email ?? "no email",
                        s.joinedOn ? `joined ${formatDate(s.joinedOn)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  {canManage && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditing(s);
                        setAdding(false);
                        setError(null);
                      }}
                    >
                      Edit
                    </Button>
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

function StaffForm({
  member,
  locations,
  roles,
  pending,
  onSubmit,
}: {
  member: StaffMember | null;
  locations: Array<{ id: string; code: string; name: string }>;
  roles: Array<{ id: string; name: string; tier: string; active: boolean }>;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form action={onSubmit} className="space-y-3">
      {member && <input type="hidden" name="id" value={member.id} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required defaultValue={member?.name ?? ""} />
        </div>
        <div>
          <Label htmlFor="roleId">Role</Label>
          <Select
            id="roleId"
            name="roleId"
            defaultValue={member?.roleId ?? ""}
            required
          >
            <option value="" disabled>
              Pick a role
            </option>
            {roles
              .filter((r) => r.active)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="employeeCode">Employee code</Label>
          <Input
            id="employeeCode"
            name="employeeCode"
            defaultValue={member?.employeeCode ?? ""}
            placeholder="SV-014"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={member?.phone ?? ""} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={member?.email ?? ""}
            placeholder="needed for alerts"
          />
        </div>
        <div>
          <Label htmlFor="locationId">Home store</Label>
          <Select id="locationId" name="locationId" defaultValue={member?.locationId ?? ""}>
            <option value="">Not set</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="joinedOn">Joined</Label>
          <Input id="joinedOn" name="joinedOn" type="date" defaultValue={member?.joinedOn ?? ""} />
        </div>
        <div>
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" name="dob" type="date" defaultValue={member?.dob ?? ""} />
        </div>
        <div>
          <Label htmlFor="emergencyName">Emergency contact</Label>
          <Input
            id="emergencyName"
            name="emergencyName"
            defaultValue={member?.emergencyName ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="emergencyPhone">Emergency phone</Label>
          <Input
            id="emergencyPhone"
            name="emergencyPhone"
            defaultValue={member?.emergencyPhone ?? ""}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={member?.address ?? ""} />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" defaultValue={member?.notes ?? ""} />
      </div>

      <p className="text-2xs text-text-muted">
        The role decides what this person can reach. Change what a role is allowed to do
        under Team &rarr; Roles; it applies to everyone on that role at once.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={member ? member.active : true}
          className="size-4 accent-brand"
        />
        Currently working here
      </label>
      <p className="text-2xs text-text-muted">
        Unticking keeps every attendance day, sale and pay record attached to the
        person &mdash; they just stop appearing in pickers.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : member ? "Save changes" : "Add person"}
      </Button>
    </form>
  );
}
