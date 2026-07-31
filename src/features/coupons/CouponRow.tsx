"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { assignCoupon, unassignCoupon, voidCoupon } from "./actions";
import { searchCustomersForCoupon } from "./customerSearch";
import { cn } from "@/lib/cn";
import type { Coupon } from "./queries";

const TONE: Record<Coupon["status"], string> = {
  available: "bg-surface-sunken text-text-muted",
  assigned: "bg-status-approved-bg text-status-approved-fg",
  redeemed: "bg-status-done-bg text-status-done-fg",
  void: "bg-status-danger-bg text-status-danger-fg",
};

export function CouponRow({
  coupon,
  batchId,
  canVoid,
}: {
  coupon: Coupon;
  batchId: string;
  canVoid: boolean;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<"none" | "assign" | "void">("none");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string | null; phone: string }>>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, extra: Record<string, string>) {
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("couponId", coupon.id);
      fd.set("batchId", batchId);
      for (const [k, v] of Object.entries(extra)) fd.set(k, v);
      const r = await fn(fd);
      if (r.ok) {
        setOpen("none");
        setQuery("");
        setResults([]);
      } else setError(r.error ?? "Something went wrong.");
    });
  }

  function search(term: string) {
    setQuery(term);
    if (!term.trim()) return setResults([]);
    start(async () => {
      const r = await searchCustomersForCoupon(term);
      if (r.ok) setResults(r.data);
    });
  }

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm font-medium">{coupon.code}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-2xs capitalize", TONE[coupon.status])}>
          {coupon.status}
        </span>
        {coupon.customerName || coupon.customerPhone ? (
          <span className="min-w-0 flex-1 truncate text-2xs text-text-muted">
            {coupon.customerName ?? "No name"} · <span className="font-mono">{coupon.customerPhone}</span>
          </span>
        ) : (
          <span className="flex-1" />
        )}

        {coupon.status === "available" && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(open === "assign" ? "none" : "assign")}>
            Assign
          </Button>
        )}
        {coupon.status === "assigned" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(unassignCoupon, {})}>
            Take back
          </Button>
        )}
        {canVoid && coupon.status !== "redeemed" && coupon.status !== "void" && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(open === "void" ? "none" : "void")}>
            Void
          </Button>
        )}
      </div>

      {coupon.voidReason && (
        <p className="mt-1 text-2xs text-status-danger-fg">Voided: {coupon.voidReason}</p>
      )}
      {error && <p className="mt-1 text-2xs text-status-danger-fg">{error}</p>}

      {open === "assign" && (
        <div className="mt-2 space-y-2 rounded-control border border-border p-2">
          <Input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search customer by name or phone"
            autoFocus
          />
          {results.length > 0 && (
            <ul className="divide-y divide-border">
              {results.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {c.name ?? "No name"} · <span className="font-mono text-2xs">{c.phone}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => run(assignCoupon, { customerId: c.id })}
                  >
                    Give
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open === "void" && (
        <div className="mt-2 space-y-2 rounded-control border border-border p-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being voided?"
          />
          <Button
            size="sm"
            variant="danger"
            disabled={pending || !reason.trim()}
            onClick={() => run(voidCoupon, { reason: reason.trim() })}
          >
            Confirm void
          </Button>
        </div>
      )}
    </li>
  );
}
