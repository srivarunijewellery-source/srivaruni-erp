"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { NarrowInput, Select, Label, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/config/nav";
import { formatDateTime } from "@/lib/format";
import { ISSUE_LABEL, type ReconRow, type LedgerEntry } from "./queries";
import { fetchItemLedger, settleDiscrepancy } from "./actions";

const TONE: Record<string, "danger" | "pending" | "neutral"> = {
  negative: "danger",
  short_received: "danger",
  sold_while_committed: "pending",
  priced_no_cost: "neutral",
};

/**
 * Stock that disagrees with itself.
 *
 * Every row here is a question, not an error to be cleared: a piece
 * below zero was sold, and the only useful next step is working out
 * which receipt was never entered. So the ledger is one click away on
 * every row — the root cause is almost always visible as the moment the
 * running balance first goes wrong.
 *
 * Nothing is corrected automatically. A counted figure typed by a person
 * who went and looked is the only honest input, which is why the fix is
 * a count and a reason rather than a "resolve" button.
 */
export function ReconciliationBoard({ rows }: { rows: ReconRow[] }) {
  const [issue, setIssue] = useState<string>("all");

  const groups = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.issue] = (acc[r.issue] ?? 0) + 1;
    return acc;
  }, {});

  const shown = issue === "all" ? rows : rows.filter((r) => r.issue === issue);

  if (rows.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-text-muted">
            Nothing to reconcile. Every balance agrees with its ledger.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setIssue("all")}
          className={`rounded-full px-3 py-1.5 text-2xs ${
            issue === "all" ? "bg-brand text-brand-fg" : "border border-border"
          }`}
        >
          All {rows.length}
        </button>
        {Object.entries(groups).map(([k, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => setIssue(k)}
            className={`rounded-full px-3 py-1.5 text-2xs ${
              issue === k ? "bg-brand text-brand-fg" : "border border-border"
            }`}
          >
            {ISSUE_LABEL[k as ReconRow["issue"]]} {n}
          </button>
        ))}
      </div>

      <Card>
        <CardBody className="p-0">
          <ul className="divide-y divide-border">
            {shown.map((r) => (
              <ReconLine key={`${r.issue}-${r.itemId}-${r.locationCode}`} row={r} />
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function ReconLine({ row }: { row: ReconRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("count_variance");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && ledger === null) {
      const r = await fetchItemLedger(row.itemId, row.locationCode);
      setLedger(r.ok ? r.data : []);
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken"
      >
        <Badge tone={TONE[row.issue] ?? "neutral"}>{ISSUE_LABEL[row.issue]}</Badge>
        <div className="min-w-40 flex-1">
          <p className="truncate text-sm">{row.itemName}</p>
          <p className="font-mono text-2xs text-text-muted">
            {row.barcode}
            {row.locationCode && ` · ${row.locationCode}`} · {row.detail}
          </p>
        </div>
        <span className="tnum text-sm">
          {row.onHand}
          {row.committed > 0 && (
            <span className="text-2xs text-text-muted"> / {row.committed} committed</span>
          )}
        </span>
        <span className="text-2xs text-text-subtle">{open ? "hide" : "history"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border bg-surface-sunken px-4 py-3">
          {/* The ledger is the explanation. A running balance is carried
              because the fault is nearly always the row where the total
              first goes wrong, and spotting that from raw deltas means
              doing the arithmetic by hand. */}
          {ledger === null ? (
            <p className="text-2xs text-text-muted">Reading the ledger…</p>
          ) : ledger.length === 0 ? (
            <p className="text-2xs text-text-muted">
              No stock movements recorded — this item has never moved at this store.
            </p>
          ) : (
            <ul className="max-h-56 space-y-0.5 overflow-auto font-mono text-2xs">
              {ledger.map((e, i) => (
                <li
                  key={i}
                  className={`grid grid-cols-[9rem_5rem_1fr_4rem] gap-2 ${
                    e.runningQty < 0 ? "text-status-danger-fg" : ""
                  }`}
                >
                  <span className="text-text-muted">{formatDateTime(e.at)}</span>
                  <span className={e.qtyDelta < 0 ? "" : "text-status-done-fg"}>
                    {e.qtyDelta > 0 ? "+" : ""}
                    {e.qtyDelta}
                  </span>
                  <span className="truncate">{e.reason.replace(/_/g, " ")}</span>
                  <span className="text-right font-semibold">{e.runningQty}</span>
                </li>
              ))}
            </ul>
          )}

          {row.locationCode && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <div>
                <Label htmlFor={`c-${row.itemId}`}>Counted on the shelf</Label>
                <NarrowInput
                  widthClass="w-20"
                  id={`c-${row.itemId}`}
                  type="number"
                  min={0}
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  className="text-center"
                />
              </div>
              <div>
                <Label htmlFor={`r-${row.itemId}`}>Because</Label>
                <Select
                  id={`r-${row.itemId}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="count_variance">Miscounted</option>
                  <option value="damage">Damaged</option>
                  <option value="lost_in_transit">Lost in transit</option>
                  <option value="adjustment">Sold and not recorded</option>
                </Select>
              </div>
              <Button
                size="sm"
                disabled={busy || counted.trim() === ""}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await settleDiscrepancy(
                      row.itemId,
                      row.locationCode!,
                      Number(counted),
                      reason,
                    );
                    if (!r.ok) setError(r.error);
                    else {
                      setNote("Recorded.");
                      router.refresh();
                    }
                  })
                }
              >
                Record the count
              </Button>
              <Link
                href={ROUTES.productDetail(row.itemId)}
                className="pb-2 text-2xs text-brand hover:underline"
              >
                open the product
              </Link>
              {note && <span className="pb-2 text-2xs text-text-muted">{note}</span>}
            </div>
          )}
          {error && <FieldError>{error}</FieldError>}
        </div>
      )}
    </li>
  );
}
