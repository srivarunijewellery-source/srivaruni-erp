#!/usr/bin/env python3
"""
Puts the quantity editor where an approved document can actually reach it.

The correction path existed but had no way in: on an approved inward the
page renders InwardDocTable (read-only) and PricingPanel. LinesSection is
the only thing that mounts LineQtyEditor, and it is rendered only for a
draft. So the editor was unreachable exactly where it was needed.

Four edits across two files. Run from the repo root:

    python3 wire-qty-correction.py

Exact-text match, idempotent, refuses rather than half-applying.
"""

import pathlib
import sys

TABLE = pathlib.Path("src/features/inward/InwardDocTable.tsx")
PAGE = pathlib.Path("src/app/(app)/inward/[id]/page.tsx")

EDITS = [
    (
        TABLE,
        "client directive",
        """import { ItemLink } from "@/components/ui/ItemLink";""",
        """"use client";

import { ItemLink } from "@/components/ui/ItemLink";""",
    ),
    (
        TABLE,
        "editor import",
        """import { formatPaise } from "@/lib/money";""",
        """import { formatPaise } from "@/lib/money";
import { LineQtyEditor } from "./LineQtyEditor";""",
    ),
    (
        TABLE,
        "props",
        """  lines: InwardLine[];
  pricing: PricingLine[];
  additionalCosts: AdditionalCost[];
  tax: InwardTaxSummary | null;
  showCost: boolean;
}) {""",
        """  lines: InwardLine[];
  pricing: PricingLine[];
  additionalCosts: AdditionalCost[];
  tax: InwardTaxSummary | null;
  showCost: boolean;
  /** Owner, on an approved document. The editor then offers the
   *  correcting path -- which adjusts stock and posts the difference to
   *  the vendor -- rather than a plain edit the trigger would refuse. */
  inwardId?: string;
  canCorrectQty?: boolean;
}) {""",
    ),
    (
        TABLE,
        "destructure",
        """  tax,
  showCost,
}: {""",
        """  tax,
  showCost,
  inwardId,
  canCorrectQty = false,
}: {""",
    ),
    (
        TABLE,
        "qty cell",
        """                  <td className="tnum px-2 py-1.5 text-right">
                    {l.qty}
                    {l.qtyShort > 0 && (
                      <span className="block text-2xs text-status-danger-fg">
                        {l.qtyShort} short
                      </span>
                    )}
                  </td>""",
        """                  <td className="tnum px-2 py-1.5 text-right">
                    {/* Editable in place on an approved document, for the
                        owner only. A miscount is noticed while reading
                        the document, so this is where it should be
                        fixable -- and the editor routes an approved
                        change through the correction that moves stock
                        and payable with it. */}
                    {canCorrectQty && inwardId ? (
                      <LineQtyEditor
                        lineId={l.id}
                        inwardId={inwardId}
                        qty={l.qty}
                        editable
                      />
                    ) : (
                      l.qty
                    )}
                    {l.qtyShort > 0 && (
                      <span className="block text-2xs text-status-danger-fg">
                        {l.qtyShort} short
                      </span>
                    )}
                  </td>""",
    ),
    (
        PAGE,
        "table props",
        """            <InwardDocTable
              lines={inward.lines}
              pricing={pricingLines}
              additionalCosts={additionalCosts}
              tax={taxSummary}
              showCost={isOwner}
            />""",
        """            <InwardDocTable
              lines={inward.lines}
              pricing={pricingLines}
              additionalCosts={additionalCosts}
              tax={taxSummary}
              showCost={isOwner}
              inwardId={inward.id}
              canCorrectQty={isOwner && inward.status === "approved"}
            />""",
    ),
]


def main() -> int:
    for path in (TABLE, PAGE):
        if not path.exists():
            print(f"REFUSED: {path} not found. Run this from the repo root.")
            return 1

    texts = {p: p.read_text() for p in (TABLE, PAGE)}

    if "canCorrectQty" in texts[TABLE] and "canCorrectQty" in texts[PAGE]:
        print("Already applied.")
        return 0

    for path, name, old, _ in EDITS:
        if texts[path].count(old) != 1:
            print(
                f"REFUSED: {path.name} — expected exactly one '{name}' site, "
                f"found {texts[path].count(old)}. The file has changed since "
                f"this was written; nothing has been touched."
            )
            return 1

    for path, _, old, new in EDITS:
        texts[path] = texts[path].replace(old, new)

    for path, text in texts.items():
        path.write_text(text)

    print("Patched:")
    print("  src/features/inward/InwardDocTable.tsx")
    print("  src/app/(app)/inward/[id]/page.tsx")
    print()
    print("InwardDocTable becomes a client component. It has no server-only")
    print("imports, so this is safe, but tsc is the judge.")
    print()
    print("Now run:  npx tsc --noEmit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
