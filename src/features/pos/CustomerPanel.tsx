"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { formatPaise } from "@/lib/money";
import { searchCustomersAction } from "./customer-actions";
import type { CustomerHit } from "./queries";

interface Extras {
  history: Array<{ bill_no: string; bill_date: string; total_paise: number; items: number }>;
  coupons: Array<{
    coupon_id: string; code: string; value: string;
    min_purchase_paise: number; valid_to: string | null;
  }>;
}

/**
 * Customer lookup, history and coupons.
 *
 * History appears the moment someone is attached, because that is the
 * conversation actually happening at the counter — "you bought a set
 * like this in March" is the reason to have this on screen at all.
 */
export function CustomerPanel({
  customer,
  onPick,
  onClear,
  coupon,
  onCoupon,
  canCoupon,
  loadExtras,
  cartTotalPaise,
}: {
  customer: CustomerHit | null;
  onPick: (c: CustomerHit) => void;
  onClear: () => void;
  coupon: { id: string; code: string; value: string } | null;
  onCoupon: (c: { id: string; code: string; value: string } | null) => void;
  canCoupon: boolean;
  loadExtras: (id: string) => Promise<
    { ok: true; data: Extras } | { ok: false; error: string }
  >;
  cartTotalPaise: number;
}) {
  const [pending, start] = useTransition();
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [extras, setExtras] = useState<Extras | null>(null);

  useEffect(() => {
    if (!customer) {
      setExtras(null);
      return;
    }
    let cancelled = false;
    start(async () => {
      const r = await loadExtras(customer.id);
      if (!cancelled && r.ok) setExtras(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [customer, loadExtras]);

  function doSearch(value: string) {
    setTerm(value);
    if (value.trim().length < 3) {
      setHits([]);
      return;
    }
    start(async () => {
      const r = await searchCustomersAction(value);
      if (r.ok) setHits(r.data);
    });
  }

  return (
    <div className="rounded-card border border-border bg-surface p-3">
      {!customer ? (
        <div className="space-y-2">
          <Label htmlFor="cust">Customer</Label>
          <Input
            id="cust"
            value={term}
            onChange={(e) => doSearch(e.target.value)}
            placeholder="Phone or name"
          />
          {hits.length > 0 && (
            <ul className="divide-y divide-border rounded-control border border-border">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(h);
                      setTerm("");
                      setHits([]);
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-surface-sunken"
                  >
                    <span className="flex-1 truncate">{h.name ?? "No name"}</span>
                    <span className="font-mono text-2xs text-text-muted">{h.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-2xs text-text-muted">
            Optional. A bill without a customer is a walk-in sale.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{customer.name ?? "No name"}</p>
              <p className="font-mono text-2xs text-text-muted">{customer.phone}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClear}>
              Remove
            </Button>
          </div>

          {extras && extras.coupons.length > 0 && canCoupon && (
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-text-muted">
                Coupons
              </p>
              <div className="flex flex-wrap gap-1.5">
                {extras.coupons.map((c) => {
                  const tooSmall = cartTotalPaise < c.min_purchase_paise;
                  const on = coupon?.id === c.coupon_id;
                  return (
                    <button
                      key={c.coupon_id}
                      type="button"
                      disabled={tooSmall}
                      title={
                        tooSmall
                          ? `Needs a purchase of at least ${formatPaise(c.min_purchase_paise)}`
                          : undefined
                      }
                      onClick={() =>
                        onCoupon(on ? null : { id: c.coupon_id, code: c.code, value: c.value })
                      }
                      className={`rounded-control px-2.5 py-1 text-2xs transition-colors disabled:opacity-40 ${
                        on
                          ? "bg-brand text-brand-fg"
                          : "border border-border hover:bg-surface-sunken"
                      }`}
                    >
                      {c.code} · {c.value}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {extras && extras.history.length > 0 && (
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-text-muted">
                Bought before
              </p>
              <ul className="space-y-0.5">
                {extras.history.slice(0, 5).map((h) => (
                  <li key={h.bill_no} className="flex justify-between text-2xs">
                    <span className="text-text-muted">
                      {new Date(h.bill_date).toLocaleDateString("en-IN")} · {h.items} items
                    </span>
                    <span className="font-mono">{formatPaise(h.total_paise)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extras && extras.history.length === 0 && (
            <Badge tone="neutral">First purchase</Badge>
          )}
          {pending && <p className="text-2xs text-text-muted">Loading…</p>}
        </div>
      )}
    </div>
  );
}
