"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { ignoreBankAlert, postBankAlert } from "./actions";
import type { BankAlert } from "./queries";

/**
 * Bank alerts, waiting to be told what they were.
 *
 * Nothing here posts itself. An email can say ₹8,000 left the account
 * and cannot say whether that was rent, stock or a personal draw — only
 * a person knows, and guessing would put fiction in the books.
 *
 * The original message sits beside the parsed fields, and every field is
 * editable, because the parser is matching patterns in text the bank can
 * change without telling anyone. When it reads something wrong, that is
 * visible and correctable rather than silently posted.
 */
export function BankInbox({
  alerts,
  accounts,
  branches,
}: {
  alerts: BankAlert[];
  accounts: Array<{ id: string; code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string }>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (alerts.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center text-sm text-text-muted">
          Nothing waiting. Alerts appear here as they arrive.
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <FieldError>{error}</FieldError>
      {msg && (
        <p className="rounded-control bg-status-done-bg px-3 py-2 text-sm text-status-done-fg">
          {msg}
        </p>
      )}

      {alerts.map((a) => (
        <AlertRow
          key={a.id}
          alert={a}
          accounts={accounts}
          branches={branches}
          expanded={open === a.id}
          pending={pending}
          onToggle={() => setOpen(open === a.id ? null : a.id)}
          onPost={(input) =>
            start(async () => {
              setError(null);
              setMsg(null);
              const r = await postBankAlert({ id: a.id, ...input });
              if (r.ok) {
                setMsg(`Posted as ${r.data}.`);
                setOpen(null);
              } else setError(r.error);
            })
          }
          onIgnore={() =>
            start(async () => {
              setError(null);
              const r = await ignoreBankAlert(a.id);
              if (!r.ok) setError(r.error);
            })
          }
        />
      ))}
    </div>
  );
}

function AlertRow({
  alert: a,
  accounts,
  branches,
  expanded,
  pending,
  onToggle,
  onPost,
  onIgnore,
}: {
  alert: BankAlert;
  accounts: Array<{ id: string; code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string }>;
  expanded: boolean;
  pending: boolean;
  onToggle: () => void;
  onPost: (input: {
    accountId: string;
    amountPaise: number;
    date: string;
    payee: string;
    method: string;
    locationId: string | null;
    note: string | null;
  }) => void;
  onIgnore: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(
    a.amountPaise === null ? "" : String(a.amountPaise / 100),
  );
  const [date, setDate] = useState(a.txnDate ?? "");
  const [payee, setPayee] = useState(a.merchant ?? "");
  const [branch, setBranch] = useState(branches[0]?.id ?? "");

  const credit = a.direction === "credit";

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-medium">
            {a.merchant ?? a.subject ?? "Bank alert"}
          </span>
          <span className="block text-2xs text-text-muted">
            {a.txnDate ? formatDate(a.txnDate) : "no date"}
            {a.accountTail ? ` · a/c …${a.accountTail}` : ""}
            {a.reference ? ` · ref ${a.reference}` : ""}
          </span>
        </button>

        {a.direction && (
          <Badge tone={credit ? "done" : "neutral"}>{a.direction}</Badge>
        )}
        {a.parseNote && <Badge tone="pending">check this</Badge>}
        <span className="tnum font-mono text-lg">
          {a.amountPaise === null ? "—" : formatPaise(a.amountPaise)}
        </span>
      </CardHeader>

      {expanded && (
        <CardBody className="space-y-3">
          {a.parseNote && (
            <p className="rounded-control bg-status-pending-bg px-3 py-2 text-2xs text-status-pending-fg">
              {a.parseNote}
            </p>
          )}

          {credit && (
            <p className="rounded-control bg-surface-sunken px-3 py-2 text-2xs text-text-muted">
              This is money coming in, not an expense. Posting it here would
              record it as a cost — use the journal instead, or ignore it.
            </p>
          )}

          {/* The email, verbatim. If the parser read something wrong, this
              is where you see it. */}
          <details className="rounded-control border border-border">
            <summary className="cursor-pointer px-3 py-2 text-2xs text-text-muted">
              The original message
            </summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap px-3 pb-3 text-2xs text-text-muted">
              {a.rawText ?? "—"}
            </pre>
          </details>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Label htmlFor={`acc-${a.id}`}>What was it for</Label>
              <Select
                id={`acc-${a.id}`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Choose a head…</option>
                {accounts.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} — {x.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`amt-${a.id}`}>Amount</Label>
              <Input
                id={`amt-${a.id}`}
                value={amount}
                inputMode="decimal"
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor={`dt-${a.id}`}>Date</Label>
              <Input
                id={`dt-${a.id}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor={`pay-${a.id}`}>Paid to</Label>
              <Input
                id={`pay-${a.id}`}
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
              />
            </div>
            {branches.length > 1 && (
              <div>
                <Label htmlFor={`br-${a.id}`}>Branch</Label>
                <Select
                  id={`br-${a.id}`}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={pending || !accountId || !amount || !date}
              onClick={() =>
                onPost({
                  accountId,
                  amountPaise: Math.round((Number(amount) || 0) * 100),
                  date,
                  payee,
                  method: "bank",
                  locationId: branch || null,
                  note: null,
                })
              }
            >
              {pending ? "Posting…" : "Post as expense"}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={onIgnore}>
              Not an expense
            </Button>
          </div>
        </CardBody>
      )}
    </Card>
  );
}
