"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { PhotoThumb } from "@/components/ui/PhotoThumb";
import { Badge } from "@/components/ui/Badge";
import { itemPhotoUrl } from "@/lib/storage";
import { formatPaise } from "@/lib/money";
import { ROUTES } from "@/config/nav";
import type { NotPickedRow } from "./notPickedTypes";

/**
 * What was asked for and never found.
 *
 * Built for someone holding a phone walking the shelves, so the photo is
 * the biggest thing on the card — a tag number does not help you spot a
 * jhumka in a tray of forty, and the picture does.
 *
 * Sorted by value: the pieces worth going back for come first, and one
 * ₹12,900 neck set is worth more than the thirty cheapest misses put
 * together.
 */
export function NotPickedGrid({ rows }: { rows: NotPickedRow[] }) {
  const [category, setCategory] = useState<string>("all");
  const [doc, setDoc] = useState<string>("all");

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category))].sort(),
    [rows],
  );
  const docs = useMemo(() => [...new Set(rows.map((r) => r.docNo))].sort(), [rows]);

  const shown = rows.filter(
    (r) =>
      (category === "all" || r.category === category) &&
      (doc === "all" || r.docNo === doc),
  );

  const pieces = shown.reduce((n, r) => n + r.missed, 0);
  const value = shown.reduce((n, r) => n + r.valuePaise, 0);

  if (rows.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-text-muted">
            Nothing outstanding. Every piece that was asked for was found and
            packed.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 w-16 text-2xs uppercase tracking-wide text-text-subtle">
              Category
            </span>
            <Chip on={category === "all"} onClick={() => setCategory("all")}>
              All {rows.length}
            </Chip>
            {categories.map((c) => (
              <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
                {c} {rows.filter((r) => r.category === c).length}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 w-16 text-2xs uppercase tracking-wide text-text-subtle">
              Transfer
            </span>
            <Chip on={doc === "all"} onClick={() => setDoc("all")}>
              All
            </Chip>
            {docs.map((d) => (
              <Chip key={d} on={doc === d} onClick={() => setDoc(d)}>
                {d}
              </Chip>
            ))}
          </div>

          <p className="tnum text-sm">
            <span className="font-semibold">{pieces}</span>{" "}
            {pieces === 1 ? "piece" : "pieces"} not packed ·{" "}
            <span className="font-semibold">{formatPaise(value)}</span> at retail
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((r) => (
          <Link
            key={`${r.itemId}-${r.docNo}`}
            href={ROUTES.productDetail(r.itemId)}
            className="flex gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:border-brand"
          >
            <PhotoThumb src={itemPhotoUrl(r.photoPath)} alt={r.name} size={72} />

            {/* min-w-0 so a long name wraps inside the card rather than
                widening the grid. */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="truncate font-mono text-2xs text-text-muted">
                {r.barcode} · {r.category}
              </p>

              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
                <Badge tone="danger">{r.missed} not packed</Badge>
                {/* The number that decides whether this is worth a
                    second look: plenty on the shelf means it was
                    misfiled, not missing. */}
                <span
                  className={
                    r.onShelf > r.missed ? "text-status-done-fg" : "text-text-muted"
                  }
                >
                  {r.onShelf} on shelf
                </span>
              </p>

              <p className="tnum mt-0.5 text-2xs">
                {formatPaise(r.sellingPricePaise)}
                {r.missed > 1 && (
                  <span className="text-text-subtle">
                    {" "}
                    · {formatPaise(r.valuePaise)} total
                  </span>
                )}
              </p>
              <p className="truncate font-mono text-2xs text-text-subtle">
                {r.docNo} · {r.fromCode}→{r.toCode}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-2xs transition-colors ${
        on ? "bg-brand text-brand-fg" : "border border-border text-text-muted hover:border-brand"
      }`}
    >
      {children}
    </button>
  );
}
