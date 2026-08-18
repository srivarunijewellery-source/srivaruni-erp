"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { NarrowInput, Label, FieldError } from "@/components/ui/Field";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import {
  setComponentCost, approveAssembly, rejectAssembly, reopenAssembly, dismantleAssembly,
  saveAssemblyPrice, suggestAssemblyPrice, applyBandToAssembly, sendBackAssemblyProducts,
  type AssemblyBandOutcome, type SendBackOutcome,
} from "./actions";
import type { ItemFormOptions, PriceBand } from "@/types/domain";
import { ItemEditRow } from "./ItemEditRow";
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
  options,
  canApprove,
}: {
  assembly: AssemblyDetail;
  bands: PriceBand[];
  /** Attribute lists, so the pricing screen can correct what the bench
   *  did not fill in. */
  options: ItemFormOptions;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** Products ticked to go back to the bench. */
  const [picked, setPicked] = useState<string[]>([]);
  const [sentBack, setSentBack] = useState<SendBackOutcome | null>(null);

  /**
   * Costs are settled once approved.
   *
   * The materials have been consumed and item_costs written, so changing
   * a component price afterwards would restate a cost the stock ledger
   * and the books already agree on. Price is different — an item can be
   * repriced any day of the week — so MRP and selling stay open.
   */
  const locked = assembly.status === "approved";

  /**
   * Sending part of a document back needs a document to send it back
   * FROM, which means submitted. A draft is already editable, and an
   * approved one has consumed its materials — that one needs Dismantle.
   */
  const canSendBack = canApprove && assembly.status === "submitted";

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

  function toggle(productId: string) {
    setPicked((cur) =>
      cur.includes(productId)
        ? cur.filter((x) => x !== productId)
        : [...cur, productId],
    );
  }

  /**
   * What this batch actually amounts to.
   *
   * One cost figure answers "how much" but not "how much of what". These
   * are the numbers you would otherwise work out on paper before
   * approving: how many designs, how many pieces, what went into them,
   * and — once priced — what the batch is worth on the shelf.
   */
  const batch = assembly.products.reduce(
    (acc, p) => {
      acc.products += 1;
      acc.pieces += p.qty;
      acc.materialLines += p.components.length;
      acc.materialPieces += p.components.reduce((n, c) => n + c.qty * p.qty, 0);
      acc.hours += p.labourHours * p.qty;
      acc.materialCost += p.unitMaterialPaise * p.qty;
      acc.labourCost += p.unitLabourPaise * p.qty;
      acc.cost += p.unitLandedPaise * p.qty;
      // Only pieces that carry a price count toward what the batch is
      // worth — averaging in an unpriced one would flatter the figure.
      if (p.sellingPricePaise !== null) {
        acc.retail += p.sellingPricePaise * p.qty;
        acc.pricedPieces += p.qty;
        acc.pricedCost += p.unitLandedPaise * p.qty;
      }
      return acc;
    },
    {
      products: 0, pieces: 0, materialLines: 0, materialPieces: 0, hours: 0,
      materialCost: 0, labourCost: 0, cost: 0, retail: 0,
      pricedPieces: 0, pricedCost: 0,
    },
  );

  const grandTotal = batch.cost;
  const batchMargin =
    batch.retail > 0 ? ((batch.retail - batch.pricedCost) / batch.retail) * 100 : null;
  const unpriced = batch.pieces - batch.pricedPieces;

  return (
    <div className="space-y-4">
      {error && <FieldError>{error}</FieldError>}

      {sentBack && (
        <p className="rounded-control border border-status-pending-fg/40 bg-status-pending-bg px-3 py-2 text-sm">
          {sentBack.moved} product{sentBack.moved === 1 ? "" : "s"} moved to{" "}
          <Link
            href={`/assembly/${sentBack.assemblyId}`}
            className="font-mono text-brand hover:underline"
          >
            {sentBack.docNo}
          </Link>{" "}
          for the bench to fix. What is left here can be approved now.
        </p>
      )}

      {locked && (
        <p className="rounded-control border border-status-done-fg/40 bg-status-done-bg px-3 py-2 text-sm">
          Approved. Materials were consumed and the pieces are in stock at the
          costs below, which are now fixed. You can still change MRP and selling
          price.{" "}
          <Link
            href={`/utilities/barcodes?assemblyId=${assembly.id}`}
            className="text-brand hover:underline"
          >
            Print tags
          </Link>
        </p>
      )}

      <AssemblyBandBar assemblyId={assembly.id} bands={bands} />

      {!locked && uncosted > 0 && (
        <p className="rounded-control border border-status-pending-fg/40 bg-status-pending-bg px-3 py-2 text-sm">
          {uncosted} material{uncosted === 1 ? "" : "s"} still need a cost. Until
          they have one the parent cost below is understated.
        </p>
      )}

      {canSendBack && (
        <SendBackBar
          assemblyId={assembly.id}
          picked={picked}
          totalProducts={assembly.products.length}
          pending={pending}
          onClear={() => setPicked([])}
          onSelectAll={() => setPicked(assembly.products.map((p) => p.id))}
          onSent={(outcome) => {
            setPicked([]);
            setSentBack(outcome);
            router.refresh();
          }}
        />
      )}

      {assembly.products.map((p) => {
        const ticked = picked.includes(p.id);
        return (
          <Card key={p.id}>
            <CardHeader
              className={`flex flex-wrap items-center gap-3 ${
                ticked ? "bg-status-pending-bg" : ""
              }`}
            >
              {/* The tick sits before the photo, where a list of things
                  to act on is read from. Only on a submitted document:
                  there is nowhere to send a draft back to, and an
                  approved one has already consumed its materials. */}
              {canSendBack && (
                <input
                  type="checkbox"
                  checked={ticked}
                  disabled={pending}
                  onChange={() => toggle(p.id)}
                  className="h-5 w-5 shrink-0 accent-[var(--brand)]"
                  aria-label={`Send ${p.name} back for edits`}
                />
              )}
              <PhotoThumb src={itemPhotoUrl(p.photoPath)} alt={p.name} size={44} />
              <div className="min-w-40 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="font-mono text-2xs text-text-muted">
                  {p.barcode} · {p.qty} to make · {p.labourHours}h each
                </p>
              </div>
              {/* Price sits on the product line, not in a block underneath:
                  the cost and the price are one decision and belong in one
                  glance. */}
              <PriceFields
                assemblyId={assembly.id}
                product={p}
                pending={pending}
                onDone={() => router.refresh()}
              />
              <div className="text-right">
                <p className="tnum text-sm font-semibold">
                  {formatPaise(p.unitLandedPaise)}
                </p>
                <p className="text-2xs text-text-subtle">landed, each</p>
              </div>
            </CardHeader>
            <CardBody className="space-y-2">
              <ItemEditRow
                assemblyId={assembly.id}
                itemId={p.itemId}
                name={p.name}
                options={options}
                disabled={pending}
              />
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
                    <span className="text-right text-2xs text-text-muted">
                      <span className="block">× {c.qty}</span>
                      {/* What this material contributes to one piece. The
                          unit cost alone made you do the multiplication in
                          your head on every line. */}
                      {c.unitCostPaise > 0 && (
                        <span className="block text-text-subtle">
                          = {formatPaise(c.unitCostPaise * c.qty)}
                        </span>
                      )}
                    </span>
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
                      disabled={pending || locked}
                      readOnly={locked}
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
            </CardBody>
          </Card>
        );
      })}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-56 flex-1">
            <p className="text-sm text-text-muted">
              {locked ? "Cost of this batch" : "Total cost of this batch"}
            </p>
            <p className="tnum text-2xl font-semibold">{formatPaise(grandTotal)}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-2xs sm:grid-cols-3">
              <Fact
                label="Products"
                value={`${batch.products} design${batch.products === 1 ? "" : "s"}`}
              />
              <Fact
                label="Pieces made"
                value={`${batch.pieces}`}
              />
              <Fact
                label="Materials used"
                value={`${batch.materialPieces} across ${batch.materialLines} line${
                  batch.materialLines === 1 ? "" : "s"
                }`}
              />
              <Fact label="Material cost" value={formatPaise(batch.materialCost)} />
              <Fact
                label="Labour"
                value={`${batch.hours}h · ${formatPaise(batch.labourCost)}`}
              />
              <Fact
                label="Cost per piece"
                value={
                  batch.pieces > 0
                    ? formatPaise(Math.round(batch.cost / batch.pieces))
                    : "—"
                }
              />
              {batch.retail > 0 && (
                <Fact label="Worth at selling price" value={formatPaise(batch.retail)} />
              )}
              {batchMargin !== null && (
                <Fact label="Margin on the batch" value={`${batchMargin.toFixed(1)}%`} />
              )}
              {unpriced > 0 && (
                <Fact
                  label="Not yet priced"
                  value={`${unpriced} piece${unpriced === 1 ? "" : "s"}`}
                  warn
                />
              )}
            </dl>
          </div>
          <div className="flex flex-wrap gap-2">
            {locked && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Take this apart? The finished pieces come out of stock and the materials go back in.",
                    )
                  ) {
                    run(() => dismantleAssembly(assembly.id));
                  }
                }}
              >
                Dismantle
              </Button>
            )}
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
                  onClick={() => run(() => reopenAssembly(assembly.id))}
                >
                  Reopen for editing
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    const reason = window.prompt("Why is this being sent back?");
                    if (reason) run(() => rejectAssembly(assembly.id, reason));
                  }}
                >
                  Send all back
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
 * Send SOME of the batch back, not all of it.
 *
 * Rejecting was all-or-nothing, and a batch of forty rarely fails as a
 * batch: three pieces have the wrong photo or a missing component, and
 * the other thirty-seven are ready. Sending the whole document back
 * meant re-checking every good piece afterwards, so in practice the bad
 * ones got approved along with the rest.
 *
 * The ticked products move to a new draft document carrying the reason,
 * and their materials go with them. What is left stays here and can be
 * approved straight away.
 *
 * The reason is typed here rather than in a window.prompt: this is the
 * only thing the bench will see, it wants more than a few words, and a
 * prompt on a phone gives you a single line with no room to think.
 */
function SendBackBar({
  assemblyId,
  picked,
  totalProducts,
  pending,
  onClear,
  onSelectAll,
  onSent,
}: {
  assemblyId: string;
  picked: string[];
  totalProducts: number;
  pending: boolean;
  onClear: () => void;
  onSelectAll: () => void;
  onSent: (outcome: SendBackOutcome) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const none = picked.length === 0;
  // Everything ticked is not a split, it is a rejection — and moving the
  // lot would leave an empty submitted shell behind with its own
  // document number. The database refuses it too; this just says so
  // before the round trip.
  const everything = picked.length === totalProducts && totalProducts > 0;

  if (none) {
    return (
      <p className="rounded-control border border-dashed border-border px-3 py-2 text-2xs text-text-muted">
        Tick any product that is wrong — bad photos, a missing material, the
        wrong sub-element — to send just those back to the bench. The rest of
        the document can still be approved.
      </p>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium">
            {picked.length} product{picked.length === 1 ? "" : "s"} ticked
          </p>
          <button
            type="button"
            onClick={onSelectAll}
            className="text-2xs text-brand hover:underline"
          >
            select all
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-2xs text-brand hover:underline"
          >
            clear
          </button>
        </div>

        <div>
          <Label htmlFor="sendback-reason">What needs fixing</Label>
          <textarea
            id="sendback-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Photos are of the wrong piece and the chain is not listed as a material."
            className="w-full rounded-control border border-border bg-surface px-2 py-1.5 text-sm"
          />
          <p className="mt-0.5 text-2xs text-text-subtle">
            This note is the only thing the bench sees, so say what is wrong
            rather than that something is.
          </p>
        </div>

        {everything && (
          <p className="text-2xs text-status-danger-fg">
            That is every product on the document. Use “Send all back” at the
            bottom instead — it returns the whole thing and keeps one document
            number.
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}

        <Button
          size="sm"
          disabled={busy || pending || everything || reason.trim().length === 0}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await sendBackAssemblyProducts(assemblyId, picked, reason);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setReason("");
              onSent(r.data);
            });
          }}
        >
          {busy ? "Sending back…" : `Send ${picked.length} back for edits`}
        </Button>
      </CardBody>
    </Card>
  );
}

/**
 * MRP and selling price for the finished piece.
 *
 * The same two fields and the same suggestion button as the inward
 * pricing screen — an assembled neck set should be priced by the rules
 * that price a bought one. Only the cost underneath arrived differently.
 */
function PriceFields({
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

  // The server is the source of truth once it answers.
  //
  // useState only reads its argument on the first render, so after
  // "Apply to all" wrote new prices and the page refreshed, these fields
  // still showed whatever they held before — the database was right and
  // the screen was lying about it. Same failure as binding a date input
  // to a prop that arrives late.
  useEffect(() => {
    setMrp(product.mrpPaise === null ? "" : (product.mrpPaise / 100).toFixed(2));
    setSp(
      product.sellingPricePaise === null
        ? ""
        : (product.sellingPricePaise / 100).toFixed(2),
    );
  }, [product.mrpPaise, product.sellingPricePaise]);

  const toPaise = (v: string) =>
    v.trim() === "" ? null : Math.round(Number(v) * 100);

  const margin =
    product.unitLandedPaise > 0 && toPaise(sp)
      ? ((toPaise(sp)! - product.unitLandedPaise) / toPaise(sp)!) * 100
      : null;

  return (
    <div className="flex items-end gap-2">
      <div>
        <Label htmlFor={`mrp-${product.id}`}>MRP</Label>
        <NarrowInput
          widthClass="w-24"
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
          widthClass="w-24"
          id={`sp-${product.id}`}
          type="number"
          min={0}
          step="0.01"
          value={sp}
          onChange={(e) => setSp(e.target.value)}
          className="text-right"
        />
      </div>
      <div className="flex flex-col gap-1 pb-0.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || pending || product.unitLandedPaise === 0}
          onClick={() =>
            start(async () => {
              const r = await suggestAssemblyPrice(product.itemId, product.unitLandedPaise);
              if (!r.ok) {
                setNote(r.error);
                return;
              }
              const v = (r.data.recommendedMrpPaise ?? 0) / 100;
              setMrp(v.toFixed(2));
              setSp(v.toFixed(2));
              setNote(r.data.inBand === false ? "outside the band" : "suggested");
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
                assemblyId, product.itemId, toPaise(mrp), toPaise(sp),
              );
              setNote(r.ok ? "saved" : r.error);
              if (r.ok) onDone();
            })
          }
        >
          Save
        </Button>
      </div>
      <p className="w-28 pb-2 text-2xs text-text-muted">
        {margin === null ? "cost it first" : `${margin.toFixed(1)}% margin`}
        {note ? ` · ${note}` : ""}
      </p>
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


function Fact({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="text-text-subtle">{label}</dt>
      <dd
        className={`tnum ${warn ? "text-status-danger-fg" : "text-text-primary"}`}
      >
        {value}
      </dd>
    </div>
  );
}
