"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { formatPaise } from "@/lib/money";
import { postManualJournal } from "./actions";
import type { LedgerAccount } from "./queries";

interface Line {
  account: string;
  debit: string;
  credit: string;
  note: string;
}

const EMPTY: Line = { account: "", debit: "", credit: "", note: "" };

/**
 * For everything that has no document behind it: owner capital brought
 * in, drawings taken out, opening balances, depreciation, a correction
 * an accountant asks for.
 *
 * The running difference is shown as you type rather than only on
 * submit, because a rejected entry after filling six lines is the
 * fastest way to make someone hate a books page.
 */
const PRESETS: Array<{ label: string; lines: Array<Partial<Line>> }> = [
  {
    label: "Owner investment",
    lines: [
      { account: "bank", debit: "" },
      { account: "capital", credit: "" },
    ],
  },
  {
    label: "Owner drawings",
    lines: [
      { account: "drawings", debit: "" },
      { account: "cash", credit: "" },
    ],
  },
  {
    label: "Cash to bank",
    lines: [
      { account: "bank", debit: "" },
      { account: "cash", credit: "" },
    ],
  },
  {
    label: "Bank charges",
    lines: [
      { account: "bank_charges", debit: "" },
      { account: "bank", credit: "" },
    ],
  },
  {
    label: "Stock written off",
    lines: [
      { account: "stock_writeoff", debit: "" },
      { account: "inventory", credit: "" },
    ],
  },
];

export function ManualJournalForm({ accounts }: { accounts: LedgerAccount[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [narration, setNarration] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY }, { ...EMPTY }]);

  const { totalDr, totalCr, diff } = useMemo(() => {
    const dr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const cr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return { totalDr: dr, totalCr: cr, diff: dr - cr };
  }, [lines]);

  const balanced = Math.abs(diff) < 0.005 && totalDr > 0;

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setNotice(null);
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setNarration(preset.label);
    setLines(
      preset.lines.map((l) => ({ ...EMPTY, ...l })).concat([{ ...EMPTY }]),
    );
    setNotice(null);
  }

  function submit() {
    start(async () => {
      setError(null);
      setNotice(null);
      const payload = lines
        .filter((l) => l.account && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
        .map((l) => ({
          account: l.account,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          note: l.note || undefined,
        }));

      const r = await postManualJournal(narration, entryDate, payload);
      if (r.ok) {
        setNotice("Posted.");
        setNarration("");
        setLines([{ ...EMPTY }, { ...EMPTY }]);
      } else setError(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <span className="font-medium">{open ? "New entry" : "Manual entry"}</span>
        <Button variant={open ? "ghost" : "primary"} onClick={() => setOpen(!open)}>
          {open ? "Cancel" : "Post an entry"}
        </Button>
      </CardHeader>

      {open && (
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="secondary"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="narration">What is this for</Label>
              <Input
                id="narration"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Capital brought in by owner"
              />
            </div>
            <div>
              <Label htmlFor="entryDate">Date</Label>
              <Input
                id="entryDate"
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
                  {i === 0 && <Label htmlFor={`acc-${i}`}>Account</Label>}
                  <Select
                    id={`acc-${i}`}
                    value={l.account}
                    onChange={(e) => setLine(i, { account: e.target.value })}
                  >
                    <option value="">Pick an account</option>
                    {accounts
                      .filter((a) => a.active)
                      .map((a) => (
                        <option key={a.id} value={a.systemKey ?? a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                  </Select>
                </div>
                <div>
                  {i === 0 && <Label htmlFor={`dr-${i}`}>Debit (₹)</Label>}
                  <Input
                    id={`dr-${i}`}
                    type="number"
                    step="0.01"
                    min={0}
                    className="w-32"
                    value={l.debit}
                    onChange={(e) => setLine(i, { debit: e.target.value, credit: "" })}
                  />
                </div>
                <div>
                  {i === 0 && <Label htmlFor={`cr-${i}`}>Credit (₹)</Label>}
                  <Input
                    id={`cr-${i}`}
                    type="number"
                    step="0.01"
                    min={0}
                    className="w-32"
                    value={l.credit}
                    onChange={(e) => setLine(i, { credit: e.target.value, debit: "" })}
                  />
                </div>
                <div className="min-w-32 flex-1">
                  {i === 0 && <Label htmlFor={`note-${i}`}>Note</Label>}
                  <Input
                    id={`note-${i}`}
                    value={l.note}
                    onChange={(e) => setLine(i, { note: e.target.value })}
                  />
                </div>
                {lines.length > 2 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    &times;
                  </Button>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setLines((prev) => [...prev, { ...EMPTY }])}
            >
              Add line
            </Button>

            <span className="text-2xs text-text-muted">
              Debits {formatPaise(Math.round(totalDr * 100))} · Credits{" "}
              {formatPaise(Math.round(totalCr * 100))}
            </span>

            {totalDr > 0 || totalCr > 0 ? (
              <Badge tone={balanced ? "done" : "danger"}>
                {balanced
                  ? "Balanced"
                  : `Out by ${formatPaise(Math.round(Math.abs(diff) * 100))}`}
              </Badge>
            ) : null}
          </div>

          <Button onClick={submit} disabled={pending || !balanced || !narration.trim()}>
            {pending ? "Posting…" : "Post entry"}
          </Button>

          {notice && <p className="text-sm text-status-done-fg">{notice}</p>}
          <FieldError>{error}</FieldError>
        </CardBody>
      )}
    </Card>
  );
}
