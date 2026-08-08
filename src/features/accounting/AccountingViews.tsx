"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { ROUTES } from "@/config/nav";
import { reverseJournal } from "./actions";
import { JournalAmend } from "./JournalAmend";
import type {
  JournalRow,
  PnlRow,
  TrialBalanceRow,
  UnpostedRow,
  AccountKind,
  LedgerAccount,
} from "./queries";

const KIND_LABEL: Record<AccountKind, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

const KIND_ORDER: AccountKind[] = ["asset", "liability", "equity", "income", "expense"];

/**
 * Anything listed here means auto-posting missed a document. The
 * triggers swallow their own errors so accounting can never block a
 * sale — this is the other half of that bargain.
 */
export function UnpostedWarning({ rows }: { rows: UnpostedRow[] }) {
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <Badge tone="danger">{rows.length}</Badge>
        <span className="font-medium">
          {rows.length === 1 ? "document is" : "documents are"} not in the books
        </span>
      </CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-border">
          {rows.slice(0, 12).map((r) => (
            <li key={`${r.docKind}-${r.docId}`} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{r.docKind}</span>{" "}
                  <span className="text-text-muted">{r.docNo}</span>
                </p>
                <p className="text-2xs text-text-muted">
                  {r.reason}
                  {r.docDate ? ` · ${formatDate(r.docDate)}` : ""}
                </p>
              </div>
              <span className="font-mono text-sm">{formatPaise(r.amountPaise)}</span>
            </li>
          ))}
        </ul>
        {rows.length > 12 && (
          <p className="px-4 py-2 text-2xs text-text-muted">
            and {rows.length - 12} more
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export function TrialBalanceTable({ rows }: { rows: TrialBalanceRow[] }) {
  const live = rows.filter((r) => r.debitPaise !== 0 || r.creditPaise !== 0);

  const totalDr = live.reduce((s, r) => s + r.debitPaise, 0);
  const totalCr = live.reduce((s, r) => s + r.creditPaise, 0);
  const balanced = totalDr === totalCr;

  if (live.length === 0) {
    return (
      <EmptyState
        title="Nothing posted yet"
        hint="Sales, purchases, payments and expenses post themselves as they happen."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-2xs text-text-muted">Total debits</p>
            <p className="font-mono text-lg">{formatPaise(totalDr)}</p>
          </div>
          <div>
            <p className="text-2xs text-text-muted">Total credits</p>
            <p className="font-mono text-lg">{formatPaise(totalCr)}</p>
          </div>
          <Badge tone={balanced ? "done" : "danger"}>
            {balanced ? "Balanced" : "Out of balance"}
          </Badge>
        </CardBody>
      </Card>

      {KIND_ORDER.map((kind) => {
        const group = live.filter((r) => r.kind === kind);
        if (group.length === 0) return null;
        const subtotal = group.reduce((s, r) => s + r.balancePaise, 0);

        return (
          <Card key={kind}>
            <CardHeader className="flex items-center justify-between gap-3">
              <span className="font-medium">{KIND_LABEL[kind]}</span>
              <span className="font-mono text-sm">{formatPaise(subtotal)}</span>
            </CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {group.map((r) => (
                  <li key={r.accountId}>
                    <Link
                      href={ROUTES.accountStatement(r.accountId)}
                      className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-sunken"
                    >
                      <span className="w-14 font-mono text-2xs text-text-muted">{r.code}</span>
                      <span className="flex-1 truncate">{r.name}</span>
                      <span className="font-mono">{formatPaise(r.balancePaise)}</span>
                    </Link>
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

export function PnlReport({
  rows,
  from,
  to,
  error,
  adjusted,
}: {
  rows: PnlRow[];
  from: string;
  to: string;
  /** The report could not be built. Not a crash: the period is usually
   *  just too wide, and the picker above is how you fix it. */
  error?: string | null;
  /** The requested period was not usable and was changed. Saying so
   *  beats silently reporting on a period nobody asked for. */
  adjusted?: string | null;
}) {
  const income = rows.filter((r) => r.section === "Income");
  const expenses = rows.filter((r) => r.section === "Expenses");
  const totalIncome = income.reduce((s, r) => s + r.amountPaise, 0);
  const totalExpense = expenses.reduce((s, r) => s + r.amountPaise, 0);
  const profit = totalIncome - totalExpense;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <DateRangePicker basePath={ROUTES.pnl} from={from} to={to} maxDays={400} />
        </CardBody>
      </Card>

      {adjusted && (
        <p className="rounded-control border border-status-pending-fg/40 bg-status-pending-bg px-3 py-2 text-sm">
          {adjusted}
        </p>
      )}

      {error && (
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-status-danger-fg">
              This period could not be totalled
            </p>
            <p className="mt-1 text-sm text-text-muted">{error}</p>
            <p className="mt-2 text-2xs text-text-subtle">
              The figures below are blank for that reason — they are not zero.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-2xs text-text-muted">Income</p>
            <p className="font-mono text-lg">{formatPaise(totalIncome)}</p>
          </div>
          <div>
            <p className="text-2xs text-text-muted">Expenses</p>
            <p className="font-mono text-lg">{formatPaise(totalExpense)}</p>
          </div>
          <div>
            <p className="text-2xs text-text-muted">
              {profit >= 0 ? "Profit" : "Loss"}
            </p>
            <p
              className={`font-mono text-lg ${
                profit >= 0 ? "text-status-done-fg" : "text-status-danger-fg"
              }`}
            >
              {formatPaise(Math.abs(profit))}
            </p>
          </div>
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        error ? null : (
          <EmptyState title="Nothing posted in this period" />
        )
      ) : (
        <>
          {[
            { label: "Income", list: income },
            { label: "Expenses", list: expenses },
          ].map(
            (section) =>
              section.list.length > 0 && (
                <Card key={section.label}>
                  <CardHeader className="font-medium">{section.label}</CardHeader>
                  <CardBody className="p-0">
                    <ul className="divide-y divide-border">
                      {section.list.map((r) => (
                        <li key={r.code} className="flex items-center gap-3 px-4 py-2 text-sm">
                          <span className="w-14 font-mono text-2xs text-text-muted">
                            {r.code}
                          </span>
                          <span className="flex-1 truncate">{r.name}</span>
                          <span className="font-mono">{formatPaise(r.amountPaise)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ),
          )}
          <p className="px-1 text-2xs text-text-muted">
            Cost of goods sold is not posted yet — it needs the landed cost of the exact
            lots sold, which the billing module will resolve. Until then this shows gross
            sales against operating costs, not true margin.
          </p>
        </>
      )}
    </div>
  );
}

export function JournalList({
  entries,
  accounts,
}: {
  entries: JournalRow[];
  accounts: LedgerAccount[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reversing, setReversing] = useState<JournalRow | null>(null);
  const [amending, setAmending] = useState<JournalRow | null>(null);

  function submit(formData: FormData) {
    start(async () => {
      setError(null);
      const r = await reverseJournal(formData);
      if (r.ok) setReversing(null);
      else setError(r.error);
    });
  }

  if (entries.length === 0) {
    return <EmptyState title="No entries yet" />;
  }

  return (
    <div className="space-y-4">
      <FieldError>{error}</FieldError>

      {reversing && (
        <Card>
          <CardHeader className="font-medium">Reverse {reversing.entryNo}</CardHeader>
          <CardBody>
            <form action={submit} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={reversing.id} />
              <div className="flex-1">
                <Label htmlFor="reason">Reason</Label>
                <Input id="reason" name="reason" required />
              </div>
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? "Reversing…" : "Reverse"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setReversing(null)}>
                Cancel
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="p-0">
          <ul className="divide-y divide-border">
            {entries.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-2xs text-text-muted">{j.entryNo}</span>
                    <span className="truncate text-sm font-medium">{j.narration}</span>
                    {j.isAuto && <Badge tone="neutral">Auto</Badge>}
                    {j.isReversed && <Badge tone="danger">Reversed</Badge>}
                    {j.reversesId && <Badge tone="pending">Reversal</Badge>}
                  </div>
                  <p className="mt-0.5 text-2xs text-text-muted">
                    {[
                      formatDate(j.entryDate),
                      j.locationCode,
                      j.sourceType,
                      j.postedByName,
                      `${j.lineCount} lines`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <span className="font-mono text-sm">{formatPaise(j.amountPaise)}</span>

                {!j.isReversed && !j.reversesId && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setAmending(j)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setReversing(j)}>
                      Reverse
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {amending && (
        <JournalAmend
          entry={amending}
          accounts={accounts}
          onClose={() => setAmending(null)}
        />
      )}

      <p className="px-1 text-2xs text-text-muted">
        The books are append-only. Correcting something posts a mirror-image entry
        against it; nothing is ever edited or deleted.
      </p>
    </div>
  );
}
