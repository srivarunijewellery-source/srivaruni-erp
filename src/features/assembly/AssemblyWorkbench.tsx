"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, NarrowInput, Label, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { AddItemDialog } from "@/features/inward/AddItemDialog";
import { AttachExistingProduct } from "./AttachExistingProduct";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import {
  addComponent, addCustomComponent, approveAssembly, dismantleAssembly, findComponents,
  deleteAssembly, reopenAssembly, rejectAssembly, removeAssemblyProduct, submitAssembly,
  updateAssemblyProduct, updateComponentQty,
} from "./actions";
import type { AssemblyDetail, AssemblyProduct, ComponentSearchResult } from "./queries";
import type { ItemFormOptions } from "@/types/domain";

/**
 * Building a product from raw materials.
 *
 * One block per finished product, collapsed once its materials are in,
 * so a document with eight pieces stays a list rather than a wall. The
 * whole thing is built for a phone held at a bench: the scan box is the
 * first thing under each open block, results are big enough to tap, and
 * a matched barcode adds itself without a confirm step.
 *
 * Materials are what ONE piece takes. Ten neck sets do not mean listing
 * ten sets of beads — qty on the product does the multiplying, and the
 * screen says so where it could otherwise be misread.
 */
export function AssemblyWorkbench({
  assembly,
  options,
  isOwner,
}: {
  assembly: AssemblyDetail;
  /** The same option lists the inward add-item form uses, so the two
   *  screens offer identical attributes. */
  options: ItemFormOptions;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(
    assembly.products.at(-1)?.id ?? null,
  );

  const editable = assembly.status === "draft";
  // Costs belong to the pricing step. A draft is a record of what went
  // into the piece; putting money on that screen invites someone to
  // start editing materials to hit a number.
  const showCosts = isOwner && assembly.status !== "draft";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That did not work.");
      else router.refresh();
    });
  }

  const totalCost = assembly.products.reduce(
    (s, p) => s + p.unitLandedPaise * p.qty,
    0,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-sm">{assembly.docNo}</p>
            <p className="text-2xs text-text-muted">
              {assembly.locationCode}
              {showCosts ? ` · labour at ${formatPaise(assembly.labourRatePaise)}/hour` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[assembly.status]}>{assembly.status}</Badge>
            {showCosts && totalCost > 0 && (
              <span className="text-sm">cost {formatPaise(totalCost)}</span>
            )}
          </div>
        </CardBody>
      </Card>

      {assembly.rejectedReason && (
        <p className="rounded-control border border-status-danger-fg/40 bg-status-danger-bg px-3 py-2 text-sm">
          {assembly.rejectedReason}
        </p>
      )}
      {error && <FieldError>{error}</FieldError>}

      {assembly.products.map((p) => (
        <ProductBlock
          key={p.id}
          product={p}
          open={openId === p.id}
          editable={editable}
          showCosts={showCosts}
          pending={pending}
          onToggle={() => setOpenId(openId === p.id ? null : p.id)}
          onRun={run}
          assemblyId={assembly.id}
        />
      ))}

      {editable && (
        <div className="flex flex-wrap gap-2">
          <AddItemDialog assemblyId={assembly.id} withLabourHours options={options} />
          <AttachExistingProduct assemblyId={assembly.id} />
        </div>
      )}

      <Card>
        <CardBody className="flex flex-wrap gap-2">
          {editable && (
            <>
              <Button
                disabled={pending || assembly.products.length === 0}
                onClick={() => run(() => submitAssembly(assembly.id))}
              >
                Submit for pricing
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete this assembly and the products created in it? This cannot be undone.",
                    )
                  ) {
                    run(async () => {
                      const r = await deleteAssembly(assembly.id);
                      if (r.ok) router.push("/assembly");
                      return r;
                    });
                  }
                }}
              >
                Delete
              </Button>
            </>
          )}
          {assembly.status === "submitted" && isOwner && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => reopenAssembly(assembly.id))}
            >
              Reopen for editing
            </Button>
          )}
          {assembly.status === "submitted" && isOwner && (
            <>
              <Button disabled={pending} onClick={() => run(() => approveAssembly(assembly.id))}>
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
          {assembly.status === "approved" && (
            <p className="text-sm text-text-muted">
              Done. Materials were consumed, the pieces are in stock at their
              computed cost, and they are priced and sellable.
            </p>
          )}
          {assembly.status === "approved" && isOwner && (
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
          {assembly.status === "approved" && (
            <Link
              href={`/utilities/barcodes?assemblyId=${assembly.id}`}
              className="text-sm text-brand hover:underline"
            >
              Print tags for this assembly
            </Link>
          )}
          {assembly.status === "submitted" && !isOwner && (
            <p className="text-sm text-text-muted">
              Sent for pricing. The owner sets the cost and price from here.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

const STATUS_TONE: Record<string, "pending" | "done" | "danger" | "neutral"> = {
  draft: "neutral",
  submitted: "pending",
  approved: "done",
  rejected: "danger",
};

function ProductBlock({
  product,
  open,
  editable,
  showCosts,
  pending,
  onToggle,
  onRun,
  assemblyId,
}: {
  product: AssemblyProduct;
  open: boolean;
  editable: boolean;
  showCosts: boolean;
  pending: boolean;
  onToggle: () => void;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  assemblyId: string;
}) {
  const missing = product.components.filter((c) => c.costSource === "none").length;

  return (
    <Card>
      {/* Collapsed, this is the summary line: what it is, how many, what
          it costs. That is enough to check a document without opening
          every block again. */}
      <CardHeader
        className="flex cursor-pointer flex-wrap items-center gap-3"
        onClick={onToggle}
      >
        <PhotoThumb src={itemPhotoUrl(product.photoPath)} alt={product.name} size={44} />
        <div className="min-w-32 flex-1">
          <p className="truncate text-sm font-medium">{product.name}</p>
          <p className="font-mono text-2xs text-text-muted">
            {product.barcode} · {product.qty} to make ·{" "}
            {product.components.length} material
            {product.components.length === 1 ? "" : "s"}
          </p>
        </div>
        {showCosts && (
          <div className="text-right">
            <p className="tnum text-sm">{formatPaise(product.unitLandedPaise)}</p>
            <p className="text-2xs text-text-subtle">each</p>
          </div>
        )}
        {showCosts && missing > 0 && <Badge tone="danger">{missing} uncosted</Badge>}
        <span className="text-2xs text-text-muted">{open ? "hide" : "open"}</span>
      </CardHeader>

      {open && (
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor={`qty-${product.id}`}>Pieces to make</Label>
              <NarrowInput
                widthClass="w-28"
                id={`qty-${product.id}`}
                type="number"
                min={1}
                defaultValue={product.qty}
                disabled={!editable || pending}
                onBlur={(e) =>
                  Number(e.target.value) !== product.qty &&
                  onRun(() =>
                    updateAssemblyProduct(assemblyId, product.id, {
                      qty: Number(e.target.value),
                    }),
                  )
                }
              />
            </div>
            <div>
              <Label htmlFor={`hrs-${product.id}`}>Hours per piece</Label>
              <NarrowInput
                widthClass="w-28"
                id={`hrs-${product.id}`}
                type="number"
                min={0}
                step="0.25"
                defaultValue={product.labourHours}
                disabled={!editable || pending}
                onBlur={(e) =>
                  Number(e.target.value) !== product.labourHours &&
                  onRun(() =>
                    updateAssemblyProduct(assemblyId, product.id, {
                      labourHours: Number(e.target.value),
                    }),
                  )
                }
              />
            </div>
            <div className={`flex-1 self-end text-right text-2xs text-text-muted ${showCosts ? "" : "hidden"}`}>
              material {formatPaise(product.unitMaterialPaise)} + labour{" "}
              {formatPaise(product.unitLabourPaise)} ={" "}
              <span className="text-text-primary">
                {formatPaise(product.unitLandedPaise)}
              </span>{" "}
              per piece
            </div>
          </div>

          <div>
            <p className="mb-1 pl-4 text-2xs uppercase tracking-wide text-text-subtle">
              Materials for one piece
            </p>
            {product.components.length === 0 ? (
              <p className="py-3 text-center text-sm text-text-muted">
                Nothing added yet. Scan or search below.
              </p>
            ) : (
              <ul className="ml-4 divide-y divide-border border-l border-border pl-3">
                {product.components.map((c) => (
                  <li
                    key={c.id}
                    className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-1.5"
                  >
                    {/* Grid, not flex. Explicit column widths cannot be
                        collapsed by a child carrying its own w-full,
                        which is what crushed the name to one character
                        per line. */}
                    <PhotoThumb src={itemPhotoUrl(c.photoPath)} alt={c.name} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-2xs">{c.name}</p>
                      <p className="font-mono text-2xs text-text-subtle">{c.barcode}</p>
                    </div>
                    <NarrowInput
                      widthClass="w-20"
                      type="number"
                      min={0}
                      defaultValue={c.qty}
                      disabled={!editable || pending}
                      onBlur={(e) =>
                        Number(e.target.value) !== c.qty &&
                        onRun(() =>
                          updateComponentQty(assemblyId, c.id, Number(e.target.value)),
                        )
                      }
                      className="text-center"
                      aria-label={`Quantity of ${c.name}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {editable && (
            <>
              <ComponentPicker
                pending={pending}
                onPick={(itemId, qty) =>
                  onRun(() => addComponent(assemblyId, product.id, itemId, qty))
                }
              />
              <CustomLine
                pending={pending}
                onAdd={(desc, qty, paise) =>
                  onRun(() =>
                    addCustomComponent(assemblyId, product.id, desc, qty, paise),
                  )
                }
              />
            </>
          )}

          {editable && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => onRun(() => removeAssemblyProduct(assemblyId, product.id))}
            >
              Remove this product
            </Button>
          )}
        </CardBody>
      )}
    </Card>
  );
}

function ComponentPicker({
  pending,
  onPick,
}: {
  pending: boolean;
  onPick: (itemId: string, qty: number) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ComponentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  /**
   * Debounced, and never disabled.
   *
   * This fired a server round trip on every keystroke, so typing a name
   * queued a dozen queries and the box stuttered. It was also disabled
   * whenever any save was in flight, which on a bench feels like the
   * screen has frozen mid-scan.
   *
   * 180ms is under the gap between keystrokes for a typist but well
   * under the pause after a barcode scanner fires its terminator, so a
   * scan still resolves in one query.
   */
  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const r = await findComponents(t);
      // A slow earlier query must not overwrite a newer one's results.
      if (mine !== seq.current) return;
      setSearching(false);
      if (!r.ok) return;

      // A full barcode match is a scan, not a search: add it and clear
      // so the scanner can fire straight into the next one.
      const exact = r.data.find(
        (x) => x.barcode.toLowerCase() === t.toLowerCase(),
      );
      if (exact) {
        onPick(exact.id, 1);
        setTerm("");
        setResults([]);
        return;
      }
      setResults(r.data);
    }, 180);
    return () => clearTimeout(timer);
    // onPick is stable enough here; including it would re-run the search
    // on every parent render, which is the problem this is solving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  return (
    <div className="rounded-control border border-dashed border-border p-2">
      <Input
        value={term}
        placeholder="Scan a tag or search by name"
        onChange={(e) => setTerm(e.target.value)}
        className="h-11 w-full sm:h-9"
      />
      {searching && <p className="mt-1 text-2xs text-text-muted">searching…</p>}
      {results.length > 0 && (
        <ul className="mt-2 max-h-64 divide-y divide-border overflow-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  onPick(r.id, 1);
                  setTerm("");
                  setResults([]);
                }}
                className="flex w-full items-center gap-3 py-2 text-left hover:bg-surface-sunken"
              >
                <PhotoThumb src={itemPhotoUrl(r.photoPath)} alt={r.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{r.name}</span>
                  <span className="block font-mono text-2xs text-text-muted">
                    {r.barcode} · {r.onHand} on hand
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}



/**
 * A material that is not in the catalog and never will be.
 *
 * Thread, glue, a findings packet bought loose. Without a line for these
 * the cost of the piece is quietly understated, or somebody creates a
 * catalog entry for a rupee of thread and it clutters search forever.
 * Consumes no stock, because there is none to consume.
 */
function CustomLine({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (description: string, qty: number, costPaise: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-2xs text-brand hover:underline"
      >
        + something not in the catalog
      </button>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-end gap-2 rounded-control border border-dashed border-border p-2">
      <div>
        <Label htmlFor="cl-desc">What is it</Label>
        <Input
          id="cl-desc"
          autoFocus
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="thread and glue"
          className="h-11 w-full sm:h-9"
        />
      </div>
      <div>
        <Label htmlFor="cl-qty">Qty</Label>
        <NarrowInput
          widthClass="w-16"
          id="cl-qty"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="text-center"
        />
      </div>
      <div>
        <Label htmlFor="cl-cost">Cost each</Label>
        <NarrowInput
          widthClass="w-24"
          id="cl-cost"
          type="number"
          min={0}
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="text-right"
        />
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          disabled={pending || !desc.trim()}
          onClick={() => {
            onAdd(desc, Number(qty) || 1, Math.round((Number(cost) || 0) * 100));
            setDesc("");
            setQty("1");
            setCost("");
            setOpen(false);
          }}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
