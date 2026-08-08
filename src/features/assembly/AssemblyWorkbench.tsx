"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import {
  addAssemblyProduct, addComponent, approveAssembly, findComponents,
  recomputeCosts, rejectAssembly, removeAssemblyProduct, submitAssembly,
  updateAssemblyProduct, updateComponentQty,
} from "./actions";
import type { AssemblyDetail, AssemblyProduct, ComponentSearchResult } from "./queries";
import type { Category } from "@/types/domain";

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
  categories,
  isOwner,
}: {
  assembly: AssemblyDetail;
  categories: Category[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(
    assembly.products.at(-1)?.id ?? null,
  );
  const [adding, setAdding] = useState(assembly.products.length === 0);

  const editable = assembly.status === "draft";

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
              {assembly.locationCode} · labour at{" "}
              {formatPaise(assembly.labourRatePaise)}/hour
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[assembly.status]}>{assembly.status}</Badge>
            {totalCost > 0 && (
              <span className="text-sm">
                cost {formatPaise(totalCost)}
              </span>
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
          pending={pending}
          onToggle={() => setOpenId(openId === p.id ? null : p.id)}
          onRun={run}
          assemblyId={assembly.id}
        />
      ))}

      {editable &&
        (adding ? (
          <NewProductForm
            categories={categories}
            pending={pending}
            onCancel={() => setAdding(false)}
            onAdd={(input) =>
              run(async () => {
                const r = await addAssemblyProduct(assembly.id, input);
                if (r.ok) {
                  setOpenId(r.data);
                  setAdding(false);
                }
                return r;
              })
            }
          />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)} disabled={pending}>
            Add another product
          </Button>
        ))}

      <Card>
        <CardBody className="flex flex-wrap gap-2">
          {editable && (
            <>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => run(() => recomputeCosts(assembly.id))}
              >
                Recalculate cost
              </Button>
              <Button
                disabled={pending || assembly.products.length === 0}
                onClick={() => run(() => submitAssembly(assembly.id))}
              >
                Submit for approval
              </Button>
            </>
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
              Materials consumed and pieces added to stock. Price them on the
              products page before they can be sold.
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
  pending,
  onToggle,
  onRun,
  assemblyId,
}: {
  product: AssemblyProduct;
  open: boolean;
  editable: boolean;
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
        <div className="text-right">
          <p className="tnum text-sm">{formatPaise(product.unitLandedPaise)}</p>
          <p className="text-2xs text-text-subtle">each</p>
        </div>
        {missing > 0 && <Badge tone="danger">{missing} uncosted</Badge>}
        <span className="text-2xs text-text-muted">{open ? "hide" : "open"}</span>
      </CardHeader>

      {open && (
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor={`qty-${product.id}`}>Pieces to make</Label>
              <Input
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
                className="h-11 w-28 sm:h-9"
              />
            </div>
            <div>
              <Label htmlFor={`hrs-${product.id}`}>Hours per piece</Label>
              <Input
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
                className="h-11 w-28 sm:h-9"
              />
            </div>
            <div className="flex-1 self-end text-right text-2xs text-text-muted">
              material {formatPaise(product.unitMaterialPaise)} + labour{" "}
              {formatPaise(product.unitLabourPaise)} ={" "}
              <span className="text-text-primary">
                {formatPaise(product.unitLandedPaise)}
              </span>{" "}
              per piece
            </div>
          </div>

          <div>
            <p className="mb-1 text-2xs uppercase tracking-wide text-text-subtle">
              Materials for one piece
            </p>
            {product.components.length === 0 ? (
              <p className="py-3 text-center text-sm text-text-muted">
                Nothing added yet. Scan or search below.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {product.components.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <HoverThumb src={itemPhotoUrl(c.photoPath)} alt={c.name} />
                    <div className="min-w-24 flex-1">
                      <p className="truncate text-sm">{c.name}</p>
                      <p className="font-mono text-2xs text-text-muted">{c.barcode}</p>
                    </div>
                    <span
                      className={`text-2xs ${
                        c.costSource === "none"
                          ? "text-status-danger-fg"
                          : "text-text-muted"
                      }`}
                    >
                      {c.costSource === "none"
                        ? "no cost known"
                        : formatPaise(c.unitCostPaise)}
                    </span>
                    <Input
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
                      className="h-11 w-20 sm:h-9"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {editable && (
            <ComponentPicker
              pending={pending}
              onPick={(itemId, qty) =>
                onRun(() => addComponent(assemblyId, product.id, itemId, qty))
              }
            />
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

/** Hover to enlarge on a mouse; tap to enlarge on a touchscreen, where
 *  there is no hover to fall back on. */
function HoverThumb({ src, alt }: { src: string | null; alt: string }) {
  const [big, setBig] = useState(false);
  return (
    <span
      onMouseEnter={() => setBig(true)}
      onMouseLeave={() => setBig(false)}
      onClick={() => setBig((b) => !b)}
      className="shrink-0"
    >
      <PhotoThumb src={src} alt={alt} size={big ? 120 : 40} />
    </span>
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

  async function search(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const r = await findComponents(value);
    setSearching(false);
    if (r.ok) {
      // A full barcode match is a scan, not a search. Add it and clear,
      // so a scanner can fire straight into the next one without anyone
      // touching the screen.
      const exact = r.data.find(
        (x) => x.barcode.toLowerCase() === value.trim().toLowerCase(),
      );
      if (exact) {
        onPick(exact.id, 1);
        setTerm("");
        setResults([]);
        return;
      }
      setResults(r.data);
    }
  }

  return (
    <div className="rounded-control border border-dashed border-border p-2">
      <Input
        value={term}
        placeholder="Scan a tag or search by name"
        disabled={pending}
        onChange={(e) => void search(e.target.value)}
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
                <span className="min-w-24 flex-1">
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

function NewProductForm({
  categories,
  pending,
  onAdd,
  onCancel,
}: {
  categories: Category[];
  pending: boolean;
  onAdd: (input: {
    name: string;
    categoryId: string;
    qty: number;
    labourHours: number;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [hours, setHours] = useState("0");

  return (
    <Card>
      <CardHeader className="font-medium">New product</CardHeader>
      <CardBody className="space-y-3">
        <div>
          <Label htmlFor="ap-name">Name</Label>
          <Input
            id="ap-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cz neck set 1509260826"
            className="h-11 w-full sm:h-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-40 flex-1">
            <Label htmlFor="ap-cat">Category</Label>
            <select
              id="ap-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-11 w-full rounded-control border border-border bg-surface px-2 text-sm sm:h-9"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ap-qty">Pieces</Label>
            <Input
              id="ap-qty"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-11 w-24 sm:h-9"
            />
          </div>
          <div>
            <Label htmlFor="ap-hrs">Hours each</Label>
            <Input
              id="ap-hrs"
              type="number"
              min={0}
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="h-11 w-24 sm:h-9"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={pending || !name.trim()}
            onClick={() =>
              onAdd({
                name,
                categoryId,
                qty: Number(qty) || 1,
                labourHours: Number(hours) || 0,
              })
            }
          >
            Add product
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
