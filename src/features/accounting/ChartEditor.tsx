"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/config/nav";
import { saveLedgerAccount } from "./actions";
import type { AccountKind, LedgerAccount } from "./queries";

const KIND_LABEL: Record<AccountKind, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

const ORDER: AccountKind[] = ["asset", "liability", "equity", "income", "expense"];

export function ChartEditor({ accounts }: { accounts: LedgerAccount[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LedgerAccount | null>(null);
  const [adding, setAdding] = useState(false);

  const open = adding || editing !== null;

  function submit(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await saveLedgerAccount(formData);
      if (r.ok) {
        setAdding(false);
        setEditing(null);
      } else setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <span className="font-medium">
            {open ? (editing ? `Editing ${editing.name}` : "New account") : "Chart of accounts"}
          </span>
          <Button
            variant={open ? "ghost" : "primary"}
            onClick={() => {
              setAdding(!open);
              setEditing(null);
              setError(null);
            }}
          >
            {open ? "Cancel" : "Add account"}
          </Button>
        </CardHeader>

        {open && (
          <CardBody>
            <form action={submit} className="space-y-3" key={editing?.id ?? "new"}>
              {editing && <input type="hidden" name="id" value={editing.id} />}

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" required defaultValue={editing?.code ?? ""} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required defaultValue={editing?.name ?? ""} />
                </div>
                <div>
                  <Label htmlFor="kind">Type</Label>
                  <Select
                    id="kind"
                    name="kind"
                    defaultValue={editing?.kind ?? "expense"}
                    disabled={Boolean(editing?.systemKey)}
                  >
                    {ORDER.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="note">Note</Label>
                <Input id="note" name="note" defaultValue={editing?.note ?? ""} />
              </div>

              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="isExpenseCategory"
                    defaultChecked={editing?.isExpenseCategory ?? false}
                    className="size-4 accent-brand"
                  />
                  Offer in the expense form
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editing ? editing.active : true}
                    className="size-4 accent-brand"
                    disabled={Boolean(editing?.systemKey)}
                  />
                  Active
                </label>
              </div>

              {editing?.systemKey && (
                <p className="text-2xs text-status-pending-fg">
                  This account is wired into auto-posting as{" "}
                  <code className="font-mono">{editing.systemKey}</code>. Renaming it is
                  safe — posting finds it by that key, not by name. Changing its type or
                  switching it off is blocked, because it would flip which side of the
                  trial balance every existing entry sits on.
                </p>
              )}

              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : editing ? "Save changes" : "Add account"}
              </Button>
            </form>
          </CardBody>
        )}
      </Card>

      <FieldError>{error}</FieldError>

      {ORDER.map((kind) => {
        const group = accounts.filter((a) => a.kind === kind);
        if (group.length === 0) return null;

        return (
          <Card key={kind}>
            <CardHeader className="font-medium">{KIND_LABEL[kind]}</CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {group.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-14 font-mono text-2xs text-text-muted">{a.code}</span>
                    <Link
                      href={ROUTES.accountStatement(a.id)}
                      className="flex-1 truncate hover:text-brand"
                    >
                      {a.name}
                    </Link>
                    {a.isExpenseCategory && <Badge tone="neutral">Expense</Badge>}
                    {a.systemKey && (
                      <span className="font-mono text-2xs text-text-subtle">{a.systemKey}</span>
                    )}
                    {!a.active && <Badge tone="danger">Off</Badge>}
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setAdding(false); }}>
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
