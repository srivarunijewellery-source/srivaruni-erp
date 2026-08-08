"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { NarrowInput, Label, FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import {
  setComponentCost, approveAssembly, rejectAssembly,
  saveAssemblyPrice, suggestAssemblyPrice, applyBandToAssembly,
  type AssemblyBandOutcome,
} from "./actions";
import type { PriceBand } from "@/types/domain";
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
  bands,
  canApprove,
}: {
  assembly: AssemblyDetail;
  bands: PriceBand[];
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

      <AssemblyBandBar assemblyId={assembly.id} bands={bands} />

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
              <p className="truncate text-sm font-medium">{p.name}</p>
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
            <ul className="ml-4 divide-y divide-border border-l border-border pl-3">
              {p.components.map((c) => (
                <li
                  key={c.id}
                  className="grid grid-cols-[32px_minmax(0,1fr)_auto_auto] items-center gap-3 py-1.5"
                >
                  <PhotoThumb src={itemPhotoUrl(c.photoPath)} alt={c.name} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-2xs">{c.name}</p>
                    <p className="font-mono text-2xs text-text-subtle">
                      {c.barcode} · {SOURCE_LABEL[c.costSource]}
                    </p>
                  </div>
                  <span className="text-2xs text-text-muted">× {c.qty}</span>
                  {/* Blank, not zero, when nothing is known. A zero in a
                      price box reads as a decision someone made. */}
                  <NarrowInput
                    widthClass="w-28"
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
                    className="text-right"
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

            <PriceRow
              assemblyId={assembly.id}
              product={p}
              pending={pending}
              onDone={() => router.refresh()}
            />
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


/**
 * MRP and selling price for the finished piece.
 *
 * The same two fields and the same suggestion button as the inward
 * pricing screen — an assembled neck set should be priced by the rules
 * that price a bought one. Only the cost underneath arrived differently.
 */
function PriceRow({
  assemblyId,
  product,
  pending,
  onDone,
}: {
  assemblyId: string;
  product: AssemblyDetail["products"][number];
  pending: boolean;
  onDone: () => void;
}) {
  const [mrp, setMrp] = useState(
    product.mrpPaise === null ? "" : (product.mrpPaise / 100).toFixed(2),
  );
  const [sp, setSp] = useState(
    product.sellingPricePaise === null
      ? ""
      : (product.sellingPricePaise / 100).toFixed(2),
  );
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const toPaise = (v: string) =>
    v.trim() === "" ? null : Math.round(Number(v) * 100);

  const margin =
    product.unitLandedPaise > 0 && toPaise(sp)
      ? ((toPaise(sp)! - product.unitLandedPaise) / toPaise(sp)!) * 100
      : null;

  return (
    <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
      <div>
        <Label htmlFor={`mrp-${product.id}`}>MRP</Label>
        <NarrowInput
          widthClass="w-28"
          id={`mrp-${product.id}`}
          type="number"
          min={0}
          step="0.01"
          value={mrp}
          onChange={(e) => setMrp(e.target.value)}
          className="text-right"
        />
      </div>
      <div>
        <Label htmlFor={`sp-${product.id}`}>Selling</Label>
        <NarrowInput
          widthClass="w-28"
          id={`sp-${product.id}`}
          type="number"
          min={0}
          step="0.01"
          value={sp}
          onChange={(e) => setSp(e.target.value)}
          className="text-right"
        />
      </div>
      <p className="pb-2 text-2xs text-text-muted">
        {margin === null
          ? "Cost the materials first, then price it."
          : `${margin.toFixed(1)}% margin on ${formatPaise(product.unitLandedPaise)} landed`}
        {note ? ` · ${note}` : ""}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || pending || product.unitLandedPaise === 0}
          onClick={() =>
            start(async () => {
              const r = await suggestAssemblyPrice(
                product.itemId,
                product.unitLandedPaise,
              );
              if (!r.ok) {
                setNote(r.error);
                return;
              }
              const v = (r.data.recommendedMrpPaise ?? 0) / 100;
              setMrp(v.toFixed(2));
              setSp(v.toFixed(2));
              setNote(
                r.data.inBand === false
                  ? "suggested, but outside the band"
                  : "suggested from the rules",
              );
            })
          }
        >
          Suggest
        </Button>
        <Button
          size="sm"
          disabled={busy || pending}
          onClick={() =>
            start(async () => {
              const r = await saveAssemblyPrice(
                assemblyId,
                product.itemId,
                toPaise(mrp),
                toPaise(sp),
              );
              setNote(r.ok ? "saved" : r.error);
              if (r.ok) onDone();
            })
          }
        >
          Save price
        </Button>
      </div>
    </div>
  );
}


/**
 * Price the whole document from one band.
 *
 * The same control the inward pricing screen carries, and for the same
 * reason: pricing six pieces is one decision, and making it six times is
 * how two identical items end up at different prices. Per-item Suggest
 * below is still there for the exceptions.
 */
function AssemblyBandBar({
  assemblyId,
  bands,
}: {
  assemblyId: string;
  bands: PriceBand[];
}) {
  const router = useRouter();
  const [bandId, setBandId] = useState(bands[0]?.id ?? "");
  const [mode, setMode] = useState<"rules_first" | "override">("rules_first");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [result, setResult] = useState<AssemblyBandOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (bands.length === 0) return null;

  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="asm-band">Price everything from</Label>
            <select
              id="asm-band"
              value={bandId}
              onChange={(e) => setBandId(e.target.value)}
              className="h-[var(--control-height)] w-52 rounded-control border border-border bg-surface px-2 text-sm"
            >
              {bands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-2xs">
            <input
              type="checkbox"
              checked={mode === "override"}
              onChange={(e) => setMode(e.target.checked ? "override" : "rules_first")}
            />
            ignore item rules
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-2xs">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
            />
            replace prices already set
          </label>
          <Button
            size="sm"
            disabled={busy || !bandId}
            onClick={() => {
              setError(null);
              setResult(null);
              start(async () => {
                const r = await applyBandToAssembly(assemblyId, bandId, mode, replaceExisting);
                if (r.ok) {
                  setResult(r.data);
                  router.refresh();
                } else setError(r.error);
              });
            }}
          >
            {busy ? "Pricing…" : "Apply to all"}
          </Button>
        </div>

        {error && <FieldError>{error}</FieldError>}
        {result && (
          <div className="text-2xs text-text-muted">
            <p>
              {result.applied} priced · {result.leftAsTyped} left as they were ·{" "}
              {result.refused} could not be done
            </p>
            {/* The ones it could NOT do are the only ones worth reading. */}
            {result.lines.filter((l) => !l.ok && l.reason).length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {result.lines
                  .filter((l) => !l.ok && l.reason)
                  .map((l, i) => (
                    <li key={i}>
                      <span className="text-text-primary">{l.name}</span> — {l.reason}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
