"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { saveRole, setRolePermissions } from "./actions";
import type { PermissionRow, RoleRow } from "./queries";

const TIER_HELP: Record<string, string> = {
  owner: "Everything, always. Cannot be restricted.",
  manager: "Counts as a manager anywhere the database checks for one — approvals, the register, the team.",
  staff: "Shop floor. Extra permissions can be added below without making them a manager.",
};

export function RoleEditor({
  roles,
  permissions,
}: {
  roles: RoleRow[];
  permissions: PermissionRow[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(roles[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const selected = roles.find((r) => r.id === selectedId) ?? null;

  // Reset the tick-set whenever a different role is opened.
  const activeKeys = useMemo(() => {
    if (!selected) return new Set<string>();
    return dirty ? draft : new Set(selected.permissionKeys);
  }, [selected, draft, dirty]);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of permissions) {
      const list = map.get(p.groupLabel) ?? [];
      list.push(p);
      map.set(p.groupLabel, list);
    }
    return Array.from(map.entries());
  }, [permissions]);

  function pick(id: string) {
    setSelectedId(id);
    setDraft(new Set());
    setDirty(false);
    setError(null);
    setNotice(null);
    setAdding(false);
  }

  function toggle(key: string) {
    const next = new Set(activeKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraft(next);
    setDirty(true);
    setNotice(null);
  }

  function savePerms() {
    if (!selected) return;
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await setRolePermissions(selected.id, Array.from(activeKeys));
      if (r.ok) {
        setNotice(`Saved. ${r.data} permission${r.data === 1 ? "" : "s"} on this role.`);
        setDirty(false);
      } else setError(r.error);
    });
  }

  function submitRole(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await saveRole(formData);
      if (r.ok) {
        setAdding(false);
        setNotice("Role saved.");
      } else setError(r.error);
    });
  }

  const isOwnerRole = selected?.key === "owner";

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-3">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <span className="font-medium">Roles</span>
            <Button
              size="sm"
              variant={adding ? "ghost" : "primary"}
              onClick={() => {
                setAdding(!adding);
                setError(null);
              }}
            >
              {adding ? "Cancel" : "New"}
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {roles.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => pick(r.id)}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-surface-sunken ${
                      r.id === selectedId ? "bg-surface-sunken font-medium" : ""
                    }`}
                  >
                    <span className="flex-1 truncate">{r.name}</span>
                    {r.isSystem && <Badge tone="neutral">system</Badge>}
                    <span className="text-2xs text-text-muted">{r.staffCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {adding && (
          <Card>
            <CardHeader className="font-medium">New role</CardHeader>
            <CardBody>
              <form action={submitRole} className="space-y-3">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required placeholder="Floor supervisor" />
                </div>
                <div>
                  <Label htmlFor="key">Key</Label>
                  <Input
                    id="key"
                    name="key"
                    required
                    pattern="[a-z][a-z0-9_]*"
                    placeholder="floor_supervisor"
                  />
                </div>
                <div>
                  <Label htmlFor="tier">Counts as</Label>
                  <Select id="tier" name="tier" defaultValue="staff">
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" />
                </div>
                <p className="text-2xs text-text-muted">
                  &ldquo;Counts as&rdquo; decides how the database itself treats this
                  person for approvals and cost. Permissions below are layered on top —
                  a cashier can be given extra abilities without becoming a manager.
                </p>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Create role"}
                </Button>
              </form>
            </CardBody>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        {selected && (
          <>
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-medium">{selected.name}</span>
                  <span className="ml-2 text-2xs text-text-muted">
                    counts as {selected.tier} · {selected.staffCount}{" "}
                    {selected.staffCount === 1 ? "person" : "people"}
                  </span>
                </div>
                {!isOwnerRole && (
                  <Button onClick={savePerms} disabled={pending || !dirty}>
                    {pending ? "Saving…" : dirty ? "Save permissions" : "Saved"}
                  </Button>
                )}
              </CardHeader>
              <CardBody className="space-y-2">
                {selected.description && (
                  <p className="text-sm text-text-muted">{selected.description}</p>
                )}
                <p className="text-2xs text-text-muted">{TIER_HELP[selected.tier]}</p>

                {isOwnerRole && (
                  <p className="rounded-control bg-status-pending-bg px-3 py-2 text-2xs text-status-pending-fg">
                    The owner role always holds every permission and cannot be edited.
                    Removing the wrong tick here would make this very page unreachable by
                    anyone, permanently.
                  </p>
                )}
                {selected.isSystem && !isOwnerRole && (
                  <p className="text-2xs text-text-muted">
                    A built-in role. Its permissions are yours to change, but it cannot be
                    deleted or re-tiered — a great deal of the database checks for it by name.
                  </p>
                )}
              </CardBody>
            </Card>

            {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
            <FieldError>{error}</FieldError>

            {groups.map(([group, perms]) => (
              <Card key={group}>
                <CardHeader className="flex items-center justify-between gap-2">
                  <span className="font-medium">{group}</span>
                  <span className="text-2xs text-text-muted">
                    {perms.filter((p) => activeKeys.has(p.key)).length} of {perms.length}
                  </span>
                </CardHeader>
                <CardBody className="p-0">
                  <ul className="divide-y divide-border">
                    {perms.map((p) => {
                      const on = activeKeys.has(p.key);
                      const locked = isOwnerRole;
                      return (
                        <li key={p.key} className="flex items-start gap-3 px-4 py-2.5">
                          <input
                            type="checkbox"
                            id={`p-${p.key}`}
                            checked={on || isOwnerRole}
                            disabled={locked || pending}
                            onChange={() => toggle(p.key)}
                            className="mt-0.5 size-4 accent-brand disabled:opacity-40"
                          />
                          <label htmlFor={`p-${p.key}`} className="min-w-0 flex-1 cursor-pointer">
                            <span className="flex flex-wrap items-center gap-2 text-sm">
                              {p.label}
                              {p.ownerOnly && (
                                <span
                                  className="text-2xs text-text-subtle"
                                  title="Also enforced by the database, which will refuse it regardless of this tick."
                                >
                                  owner-level
                                </span>
                              )}
                            </span>
                            {p.description && (
                              <span className="mt-0.5 block text-2xs text-text-muted">
                                {p.description}
                              </span>
                            )}
                          </label>
                          <code className="font-mono text-2xs text-text-subtle">{p.key}</code>
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              </Card>
            ))}

            <p className="px-1 text-2xs text-text-muted">
              These ticks decide what the interface offers. Anything marked owner-level is
              additionally enforced inside the database, so ticking it for a non-owner
              role will still be refused there — the database always wins, which is the
              safe direction to disagree.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
