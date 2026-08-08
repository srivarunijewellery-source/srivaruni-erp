"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { setComponentCost, approveAssembly, rejectAssembly } from "./actions";
import type { AssemblyDetail } from "./queries";

/**
 * Pricing an assembly, owner only.
 *
 * The order matters and the screen enforces it: every component has to
 * carry a cost before the parent has a meaningful one. A material the
 * system could not cost shows an empty, editable field rather than a
 * zero — a zero looks like an answer, and it would quietly understate
 * what the piece cost to make and inflate the margin on it forever.
 *
 * The price field sits in the same column as the quantity, so a row
 * reads left to right as: what it is, how many, what it cost.
 */
export function AssemblyPricingPanel({
  assembly,
  canApprove,
}: {
  assembly: AssemblyDetail;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const uncosted = assembly.products.flatMap((p) =>
    p.components.filter((c) => c.costSource === "none"),
  ).length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That did not work.");
      else router.refresh();
    });
  }

  const grandTotal = assembly.products.reduce(
    (s, p) => s + p.unitLandedPaise * p.qty,
    0,
  );

  return (
    <div className="space-y-4">
      {error && <FieldError>{error}</FieldError>}

      {uncosted > 0 && (
        <p className="rounded-control border border-status-pending-fg/40 bg-status-pending-bg px-3 py-2 text-sm">
          {uncosted} material{uncosted === 1 ? "" : "s"} still need a cost. Until
          they have one the parent cost below is understated.
        </p>
      )}

      {assembly.products.map((p) => (
        <Card key={p.id}>
          <CardHeader className="flex flex-wrap items-center gap-3">
            <PhotoThumb src={itemPhotoUrl(p.photoPath)} alt={p.name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium leading-tight">{p.name}</p>
              <p className="font-mono text-2xs text-text-muted">
                {p.barcode} · {p.qty} to make · {p.labourHours}h each
              </p>
            </div>
            <div className="text-right">
              <p className="tnum text-lg font-semibold">
                {formatPaise(p.unitLandedPaise)}
              </p>
              <p className="text-2xs text-text-subtle">landed, each</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-2">
            <ul className="divide-y divide-border">
              {p.components.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <PhotoThumb src={itemPhotoUrl(c.photoPath)} alt={c.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm leading-tight">{c.name}</p>
                    <p className="font-mono text-2xs text-text-muted">
                      {c.barcode} · {SOURCE_LABEL[c.costSource]}
                    </p>
                  </div>
                  <span className="w-12 shrink-0 text-center text-2xs text-text-muted">
                    × {c.qty}
                  </span>
                  {/* Blank, not zero, when nothing is known. A zero in a
                      price box reads as a decision someone made. */}
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={
                      c.costSource === "none" ? "" : (c.unitCostPaise / 100).toFixed(2)
                    }
                    placeholder="cost"
                    disabled={pending}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === "") return;
                      const paise = Math.round(Number(v) * 100);
                      if (!Number.isFinite(paise) || paise === c.unitCostPaise) return;
                      run(() => setComponentCost(assembly.id, c.id, paise));
                    }}
                    className="h-11 w-28 shrink-0 text-right sm:h-9"
                    aria-label={`Cost of ${c.name}`}
                  />
                </li>
              ))}
            </ul>
            <p className="text-right text-2xs text-text-muted">
              materials {formatPaise(p.unitMaterialPaise)} + labour{" "}
              {formatPaise(p.unitLabourPaise)} ={" "}
              <span className="text-text-primary">
                {formatPaise(p.unitLandedPaise)}
              </span>{" "}
              per piece · {formatPaise(p.unitLandedPaise * p.qty)} for {p.qty}
            </p>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-text-muted">Total cost of this batch</p>
            <p className="tnum text-2xl font-semibold">{formatPaise(grandTotal)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canApprove && (
              <>
                <Button
                  disabled={pending}
                  onClick={() => run(() => approveAssembly(assembly.id))}
                >
                  Approve and post
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    const reason = window.prompt("Why is this being sent back?");
                    if (reason) run(() => rejectAssembly(assembly.id, reason));
                  }}
                >
                  Send back
                </Button>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      <p className="text-2xs text-text-muted">
        Approving consumes the materials and brings the finished pieces into
        stock at the cost above. Their selling price is then set the same way as
        any other item, from the pricing rules on the products page.
      </p>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  landed: "recorded cost",
  multiplier: "from design code",
  owner: "you set this",
  none: "needs a cost",
};
