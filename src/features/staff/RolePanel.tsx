"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Label, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { assignStaffRole } from "@/features/roles/actions";
import type { RoleRow } from "@/features/roles/queries";

export function RolePanel({
  staffId,
  currentRoleId,
  currentRoleName,
  roles,
}: {
  staffId: string;
  currentRoleId: string | null;
  currentRoleName: string;
  roles: RoleRow[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roleId, setRoleId] = useState(currentRoleId ?? "");

  const chosen = roles.find((r) => r.id === roleId);

  function save() {
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await assignStaffRole(staffId, roleId);
      if (r.ok) setNotice("Role updated. It applies on their next page load.");
      else setError(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          Role
          <Badge tone="neutral">{currentRoleName}</Badge>
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Label htmlFor="roleId">Assigned role</Label>
            <Select
              id="roleId"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              <option value="">Not assigned</option>
              {roles
                .filter((r) => r.active)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </Select>
          </div>
          <Button onClick={save} disabled={pending || !roleId || roleId === currentRoleId}>
            {pending ? "Saving…" : "Change role"}
          </Button>
        </div>

        {chosen && (
          <p className="text-2xs text-text-muted">
            {chosen.description ?? "No description."} Counts as{" "}
            <strong>{chosen.tier}</strong> in the database, with{" "}
            {chosen.permissionKeys.length} permission
            {chosen.permissionKeys.length === 1 ? "" : "s"}.
          </p>
        )}

        {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
        <FieldError>{error}</FieldError>
      </CardBody>
    </Card>
  );
}
