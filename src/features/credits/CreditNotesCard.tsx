"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FieldError, Input, Label, Select } from "@/components/ui/Field";
import { formatPaise, parseRupeesToPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { saveCreditNote } from "./actions";
import type { CreditNote, OpenBill } from "./queries";

/**
 * Credit notes against a vendor.
 *
 * Recorded here rather than under payments because no money moves — a
 * credit offsets a later bill. Keeping it out of payments is what stops
 * the bank reconciliation from drifting.
 */
export function CreditNotesCard({
  vendorId,
  notes,
  bills,
  unappliedPaise,
}: {
  vendorId: string;
  notes: CreditNote[];
  bills: OpenBill[];
  unappliedPaise: number;
}) {
  const [open, setOpen] = useState(false);
  const [noteNo, setNoteNo] = useState("");
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [inwardId, setInwardId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const paise = parseRupeesToPaise(amount);
    if (!paise) {
      setError("Enter an amount like 1200 or 1200.50");
      return;
    }
    setBusy(true);
    const res = await saveCreditNote({
      vendorId,
      noteNo: noteNo.trim() || null,
      noteDate,
      amountPaise: paise,
      reason: reason.trim() || null,
      inwardId: inwardId || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNoteNo(""); setAmount(""); setReason(""); setInwardId("");
    setOpen(false);
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h2 className="font-medium">Credit notes</h2>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "Record a credit"}
        </Button>
      </CardHeader>
      <CardBody className="space-y-3">
        {unappliedPaise > 0 && (
          <p className="rounded-control border border-border bg-surface-sunken px-2 py-1.5 text-sm">
            <span className="tnum font-medium">{formatPaise(unappliedPaise)}</span>{" "}
            <span className="text-text-muted">
              not yet applied to a bill. It already reduces the amount due.
            </span>
          </p>
        )}

        {open && (
          <div className="space-y-2 rounded-card border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label htmlFor="cn-no">Vendor&rsquo;s note no.</Label>
                <Input
                  id="cn-no" value={noteNo} placeholder="optional"
                  onChange={(e) => setNoteNo(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cn-date">Date</Label>
                <Input
                  id="cn-date" type="date" value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cn-amt">Amount</Label>
                <Input
                  id="cn-amt" inputMode="decimal" placeholder="0.00" value={amount}
                  onChange={(e) => setAmount(e.target.value)} className="tnum text-right"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cn-reason">Reason</Label>
              <Input
                id="cn-reason" value={reason} placeholder="short shipment, damaged pieces…"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="cn-bill">Apply to a bill</Label>
              <Select id="cn-bill" value={inwardId} onChange={(e) => setInwardId(e.target.value)}>
                <option value="">Leave unapplied for now</option>
                {bills.map((b) => (
                  <option key={b.inwardId} value={b.inwardId}>
                    {b.docNo} · {formatPaise(b.totalPaise)}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-2xs text-text-muted">
                Either way it reduces what is owed. Applying it records which bill it settled.
              </p>
            </div>

            <FieldError>{error}</FieldError>
            <Button type="button" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Record credit note"}
            </Button>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-sm text-text-muted">No credit notes from this vendor.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">
                    {n.noteNo ?? "No reference"}
                    <span className="ml-2 font-normal text-text-muted">
                      {formatDate(n.noteDate)}
                    </span>
                  </p>
                  {n.reason && <p className="text-2xs text-text-muted">{n.reason}</p>}
                  {n.allocations.length > 0 && (
                    <p className="text-2xs text-text-subtle">
                      Applied to {n.allocations.map((a) => a.docNo).join(", ")}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="tnum font-medium">{formatPaise(n.amountPaise)}</p>
                  {n.appliedPaise < n.amountPaise && (
                    <p className="tnum text-2xs text-text-muted">
                      {formatPaise(n.amountPaise - n.appliedPaise)} unapplied
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
