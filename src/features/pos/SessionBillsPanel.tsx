"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
import { formatPaise } from "@/lib/money";
import { fetchBillForReprint, fetchSessionBills } from "./actions";
import { printReceipt, type ReceiptData } from "./receipt";
import type { Seller, SessionBill } from "./queries";
import { BillActions } from "./BillActions";
import { BillPeek } from "@/features/sales/BillPeek";

/** The parts of a slip that come from the shop, not from the bill. */
export type ReceiptHeader = Pick<
  ReceiptData,
  | "shopName"
  | "gstin"
  | "locationName"
  | "branchAddress"
  | "branchPhone"
  | "terms"
  | "footer"
  | "upiId"
  | "print"
  | "qrDataUrl"
  | "qrHandle"
>;

/**
 * Bills rung on this counter, this session.
 *
 * Staff have no route to the Sales screen, and should not: it shows
 * every branch and every day. What they actually need is narrow — find
 * the bill from twenty minutes ago and print it again because the
 * printer chewed the first one. So this lists only the session in front
 * of them, and closing the register takes the list with it.
 */
export function SessionBillsPanel({
  sessionId,
  terminal,
  header,
  sellers,
  locationId,
  canAmend,
  canCancel,
  onClose,
}: {
  sessionId: string;
  locationId: string;
  terminal: string;
  header: ReceiptHeader;
  sellers: Seller[];
  /** Manager or owner. Amendments are theirs to make. */
  canAmend: boolean;
  /** Owner only: cancel a bill outright, no replacement. */
  canCancel?: boolean;
  onClose: () => void;
}) {
  const [bills, setBills] = useState<SessionBill[] | null>(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [acting, setActing] = useState<SessionBill | null>(null);
  const [peek, setPeek] = useState<SessionBill | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchSessionBills(sessionId);
      if (!cancelled) setBills(r.ok ? r.data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  function reprint(bill: SessionBill) {
    setBusy(bill.billId);
    start(async () => {
      setError(null);
      const r = await fetchBillForReprint(bill.billId);
      setBusy(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const b = r.data;
      printReceipt({
        ...header,
        billNo: b.billNo,
        dateText: new Date(b.rungAt).toLocaleString("en-IN"),
        staffName: bill.soldByName ?? "",
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        lines: b.lines,
        grossPaise: b.grossPaise,
        discountPaise: b.discountPaise,
        taxablePaise: b.taxablePaise,
        cgstPaise: b.cgstPaise,
        sgstPaise: b.sgstPaise,
        igstPaise: b.igstPaise,
        totalPaise: b.totalPaise,
        payments: b.payments,
      });
    });
  }

  const term = q.trim().toLowerCase();
  const shown = (bills ?? []).filter(
    (b) =>
      !term ||
      b.billNo.toLowerCase().includes(term) ||
      b.customerName?.toLowerCase().includes(term) ||
      b.customerPhone?.includes(term),
  );

  const total = (bills ?? [])
    .filter((b) => b.status === "final")
    .reduce((s, b) => s + b.totalPaise, 0);

  return (
    <Modal title={`Bills on ${terminal}`} onClose={onClose} width="max-w-2xl">
      <div className="space-y-3">
        {bills === null ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : bills.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            Nothing rung on this counter yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Bill number, name or phone"
                className="max-w-xs"
                autoFocus
              />
              <span className="ml-auto text-sm text-text-muted">
                {bills.filter((b) => b.status === "final").length} bills ·{" "}
                <span className="tnum font-mono text-text">{formatPaise(total)}</span>
              </span>
            </div>

            <ul className="divide-y divide-border rounded-card border border-border">
              {shown.map((b) => (
                <li key={b.billId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      {/* The number opens the bill. Check what is on it
                          before changing anything about it. */}
                      <button
                        type="button"
                        onClick={() => setPeek(b)}
                        className="font-mono font-medium hover:text-brand hover:underline"
                      >
                        {b.billNo}
                      </button>
                      {b.status === "cancelled" && <Badge tone="danger">cancelled</Badge>}
                    </p>
                    <p className="truncate text-2xs text-text-muted">
                      {new Date(b.rungAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {b.customerName ? ` · ${b.customerName}` : " · walk-in"}
                      {b.soldByName ? ` · ${b.soldByName}` : ""} · {b.items} item
                      {b.items === 1 ? "" : "s"}
                      {/* How it was paid, on the row. Switching a bill to
                          cash without being able to see what it currently
                          is means guessing, which is the one thing this
                          screen should never require. */}
                      {b.paymentMode && (
                        <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 py-0.5 uppercase tracking-wide text-text">
                          {b.paymentMode}
                        </span>
                      )}
                    </p>
                  </div>

                  <span className="tnum shrink-0 font-mono text-sm">
                    {formatPaise(b.totalPaise)}
                  </span>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => reprint(b)}
                  >
                    {busy === b.billId ? "..." : "Print"}
                  </Button>

                  {canAmend && b.status === "final" && (
                    <Button size="sm" variant="ghost" onClick={() => setActing(b)}>
                      Change
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            {shown.length === 0 && (
              <p className="py-4 text-center text-sm text-text-muted">
                No bill matches that.
              </p>
            )}
          </>
        )}

        {error && <p className="text-sm text-status-danger-fg">{error}</p>}
        {done && (
          <p className="rounded-control bg-status-done-bg px-3 py-2 text-sm text-status-done-fg">
            {done}
          </p>
        )}

        <p className="text-2xs text-text-subtle">
          This counter only. Once the register is closed these stop showing here — ask a
          manager for anything older.
        </p>
      </div>

      {peek && (
        <BillPeek billId={peek.billId} billNo={peek.billNo} onClose={() => setPeek(null)} />
      )}

      {acting && (
        <BillActions
          canCancel={canCancel}
          bill={acting}
          sellers={sellers}
          locationId={locationId}
          onClose={() => setActing(null)}
          onDone={(msg) => {
            setDone(msg);
            setActing(null);
            // The list is now stale -- a corrected bill has a new number
            // and the old one is cancelled.
            void (async () => {
              const r = await fetchSessionBills(sessionId);
              if (r.ok) setBills(r.data);
            })();
          }}
        />
      )}
    </Modal>
  );
}
