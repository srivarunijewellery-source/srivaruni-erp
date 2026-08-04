"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { saveTaxRateRow } from "./actions";
import type { TaxRate } from "./queries";

export function TaxEditor({ rates }: { rates: TaxRate[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [adding, setAdding] = useState(false);

  const open = adding || editing !== null;

  function submit(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await saveTaxRateRow(formData);
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
            {open ? (editing ? `Editing ${editing.name}` : "New rate") : "GST rates"}
          </span>
          <Button
            variant={open ? "ghost" : "primary"}
            onClick={() => {
              setAdding(!open);
              setEditing(null);
              setError(null);
            }}
          >
            {open ? "Cancel" : "Add rate"}
          </Button>
        </CardHeader>

        {open && (
          <CardBody>
            <form action={submit} className="space-y-3" key={editing?.id ?? "new"}>
              {editing && <input type="hidden" name="id" value={editing.id} />}

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required defaultValue={editing?.name ?? ""} />
                </div>
                <div>
                  <Label htmlFor="percent">Rate (%)</Label>
                  <Input
                    id="percent"
                    name="percent"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    required
                    defaultValue={editing ? editing.totalBps / 100 : ""}
                  />
                </div>
                <div>
                  <Label htmlFor="hsnCode">HSN / SAC</Label>
                  <Input id="hsnCode" name="hsnCode" defaultValue={editing?.hsnCode ?? ""} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="appliesTo">Applies to</Label>
                  <Select id="appliesTo" name="appliesTo" defaultValue="both">
                    <option value="both">Goods and services</option>
                    <option value="goods">Goods only</option>
                    <option value="services">Services only</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="note">Note</Label>
                  <Input id="note" name="note" defaultValue={editing?.note ?? ""} />
                </div>
              </div>

              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="isDefault"
                    defaultChecked={editing?.isDefault ?? false}
                    className="size-4 accent-brand"
                  />
                  Default rate
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editing ? editing.active : true}
                    className="size-4 accent-brand"
                  />
                  Active
                </label>
              </div>

              <p className="text-2xs text-text-muted">
                A rate must be an even number of basis points — CGST and SGST are each
                exactly half, and an odd total would lose a paisa on every invoice.
                Once documents use a rate its percentage is locked; add a new rate and
                switch to it instead, so invoices already issued keep the rate they were
                taxed at.
              </p>

              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : editing ? "Save changes" : "Add rate"}
              </Button>
            </form>
          </CardBody>
        )}
      </Card>

      <FieldError>{error}</FieldError>

      <Card>
        <CardBody className="p-0">
          <ul className="divide-y divide-border">
            {rates.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {r.isDefault && <Badge tone="done">Default</Badge>}
                    {!r.active && <Badge tone="danger">Inactive</Badge>}
                  </div>
                  <p className="mt-0.5 text-2xs text-text-muted">
                    {[r.hsnCode ? `HSN ${r.hsnCode}` : null, `from ${formatDate(r.effectiveFrom)}`, r.note]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-mono text-sm">{(r.totalBps / 100).toFixed(2)}%</p>
                  <p className="text-2xs text-text-muted">
                    within state: {(r.totalBps / 200).toFixed(2)} + {(r.totalBps / 200).toFixed(2)}
                    {" · "}interstate: {(r.totalBps / 100).toFixed(2)} IGST
                  </p>
                </div>

                <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setAdding(false); }}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
