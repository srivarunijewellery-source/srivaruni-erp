"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { formatPaise } from "@/lib/money";
import { amendJournal } from "./actions";
import { loadJournalLines } from "./line-actions";
import type { JournalRow, LedgerAccount } from "./queries";

interface EditLine {
  account: string;
  debit: string;
  credit: string;
  note: string;
}

/**
 * "Edit" a posted entry.
 *
 * What actually happens is a reversal plus a corrected entry, both in
 * one transaction — the ledger keeps all three rows so any past date
 * stays reconstructable. The person gets the experience they asked for;
 * the books keep the property that makes them worth having.
 */
export function JournalAmend({
  entry,
  accounts,
  onClose,
}: {
  entry: JournalRow;
  accounts: LedgerAccount[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [narration, setNarration] = useState(entry.narration ?? "");
  const [entryDate, setEntryDate] = useState(entry.entryDate);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);

  useEffect(() => {
    let cancelled = false;
    start(async () => {
      const r = await loadJournalLines(entry.id);
      if (cancelled) return;
      if (r.ok) {
        setLines(
          r.data.map((l) => ({
            account: l.accountCode,
            debit: l.debitPaise ? (l.debitPaise / 100).toFixed(2) : "",
            credit: l.creditPaise ? (l.creditPaise / 100).toFixed(2) : "",
            note: l.note ?? "",
          })),
        );
      } else setError(r.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  const totalDr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.005 && totalDr > 0;

  function set(i: number, patch: Partial<EditLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function submit() {
    start(async () => {
      setError(null);
      const r = await amendJournal(
        entry.id,
        narration,
        entryDate,
        reason,
        lines
          .filter((l) => l.account && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
          .map((l) => ({
            account: l.account,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            note: l.note || undefined,
          })),
      );
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={`Edit ${entry.entryNo}`} onClose={onClose} width="max-w-3xl">
      <div className="space-y-3">
        <p className="rounded-control bg-surface-sunken px-3 py-2 text-2xs text-text-muted">
          Saving does not overwrite the original. It posts a reversal and a corrected
          entry, both at once, so the trial balance stays right and the original stays
          readable. You will see three entries afterwards, which is the point.
        </p>

        {loading ? (
          <p className="text-sm text-text-muted">Loading the entry…</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="am-narration">Narration</Label>
                <Input
                  id="am-narration"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="am-date">Date</Label>
                <Input
                  id="am-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </div>
            </div>

            <ul className="space-y-2">
              {lines.map((l, i) => (
                <li key={i} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1">
                    {i === 0 && <Label htmlFor={`am-a-${i}`}>Account</Label>}
                    <Select
                      id={`am-a-${i}`}
                      value={l.account}
                      onChange={(e) => set(i, { account: e.target.value })}
                    >
                      <option value="">Pick an account</option>
                      {accounts
                        .filter((a) => a.active)
                        .map((a) => (
                          <option key={a.id} value={a.code}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                  <div>
                    {i === 0 && <Label htmlFor={`am-d-${i}`}>Debit ₹</Label>}
                    <Input
                      id={`am-d-${i}`}
                      type="number"
                      step="0.01"
                      min={0}
                      className="w-32"
                      value={l.debit}
                      onChange={(e) => set(i, { debit: e.target.value, credit: "" })}
                    />
                  </div>
                  <div>
                    {i === 0 && <Label htmlFor={`am-c-${i}`}>Credit ₹</Label>}
                    <Input
                      id={`am-c-${i}`}
                      type="number"
                      step="0.01"
                      min={0}
                      className="w-32"
                      value={l.credit}
                      onChange={(e) => set(i, { credit: e.target.value, debit: "" })}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setLines((p) => [...p, { account: "", debit: "", credit: "", note: "" }])
                }
              >
                Add line
              </Button>
              <span className="text-2xs text-text-muted">
                Debits {formatPaise(Math.round(totalDr * 100))} · Credits{" "}
                {formatPaise(Math.round(totalCr * 100))}
              </span>
              <Badge tone={balanced ? "done" : "danger"}>
                {balanced
                  ? "Balanced"
                  : `Out by ${formatPaise(Math.round(Math.abs(totalDr - totalCr) * 100))}`}
              </Badge>
            </div>

            <div>
              <Label htmlFor="am-reason">Why is this being changed</Label>
              <Input
                id="am-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Amount was understated"
              />
            </div>

            <FieldError>{error}</FieldError>

            <div className="flex gap-2">
              <Button onClick={submit} disabled={pending || !balanced || !reason.trim()}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
