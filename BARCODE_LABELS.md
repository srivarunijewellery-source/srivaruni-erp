# Barcode label printing

New module, not a change to an existing one. Nothing in this delivery touches
the database — no migrations, no new tables. Pure application layer.

## Update — configurable inter-label gap (this delivery)

Added a "Gap between labels" control in the UI, 0–5mm, default 2mm, next to
the printable-area selector. This is the blank space between one label and
the next along the roll's feed direction — not part of the 100mm label
itself, but extra width appended after it, so each PDF page represents one
full pitch (label + trailing gap) rather than just the label. Set it to 0 if
your printer's own gap sensor already handles spacing and the PDF should
describe only the label.

Verified: generated a label with a 2.5mm gap, confirmed via `pdfinfo` the
resulting page is exactly 102.5mm × 15mm (100 + 2.5, height unaffected), then
rendered it to an image to confirm the blank space lands after the content,
not disturbing anything else.

**Bug found and fixed in the same pass:** wiring the gap constants into the
client-side queue component by importing them from `pdf.ts` pulled the
entire module — including `bwip-js` and `pdf-lib`, both server-only,
several hundred KB — into the browser bundle. `/utilities/barcodes` briefly
went from 3.65kB to 423kB. Fixed by splitting the shared constants and the
`PrintAreaMm` type into their own `constants.ts` with no heavy imports;
`pdf.ts` and the client component both import from there now, and `pdf.ts`
itself is only ever reached from the server-only API route. Confirmed via a
rebuild that the page is back to 3.84kB.

---

## Physical spec (confirmed against a photo of the actual roll)

- Full label: **100mm x 15mm**, continuous roll, one label per row
- Printable area: **65mm x 15mm** or **70mm x 15mm**, chosen per print run
- The printable area folds at **its own midpoint**, not the label's midpoint
- The remainder (100 − printable) is a blank adhesive tail, used to wrap
  around a string loop and seal to itself

Mechanically: thermal stock prints on the face and carries adhesive on the
back. Folding brings the two printed-face halves back-to-back
(adhesive-to-adhesive), sandwiching a string loop, while both original front
faces stay externally visible — one per side, like a tiny closed book.
Barcode on one fold, item details on the other; both stay readable.

**One assumption I could not verify without a real test print:** the
printable zone is left-aligned within the 100mm label (printed head first,
blank tail feeds through after). If your stock is tail-first instead, flip
`PRINTABLE_ALIGN` in `src/features/barcodes/pdf.ts` — everything else is
unaffected.

## What's on the label

- **Left fold:** Code128 barcode (scannable) + the barcode number as text
- **Right fold:** design code (bold), item name (wraps to two lines if
  needed), MRP

Price uses `mrp_paise`, not `selling_price_paise` — the legal MRP, not a
possibly-discounted current selling price.

**`design_code` is currently `null` on every item I sampled in your live
data.** Not a bug — it's a real, unpopulated column. Until it's entered,
labels lean on the item name as the primary identifying text. Worth deciding
whether design code entry becomes part of the inward flow.

## Verification

Built and checked in three stages before touching the real app:

1. Prototyped the geometry in Python/reportlab, rendered to PNG at 600 DPI,
   visually inspected both the 65mm and 70mm variants.
2. Ported to TypeScript (`pdf-lib` + `bwip-js` — the latter renders Code128
   server-side with no native `canvas` dependency, which matters on Vercel).
   Ran the TS function standalone, rendered its output the same way,
   confirmed it matches the Python version pixel-for-pixel in layout.
3. Confirmed the live schema shape (`items.barcode`, `.design_code`,
   `.name`, `.mrp_paise`) matches what the queries expect, and that the
   `inward_lines` embed pattern mirrors the one already proven in
   `features/inward/queries.ts` rather than guessing at a foreign key name.

**Not yet verified: an actual physical test print.** Everything above
checks the geometry is internally consistent and matches the stated
dimensions — it cannot confirm your printer driver, DPI, or the stock's
real-world alignment. Print one sheet before running a batch. The two things
most worth checking by eye: the fold lands where the dashed line says it
does, and the barcode still scans after folding.

## How to reach it

- **Standalone:** Utilities → Barcode labels — search and queue up anything
- **From a product:** "Print barcode" on the product detail page, prefilled
  with that item at qty 1
- **From an inward document:** "Print barcodes" on the inward detail page,
  prefilled with every line at its received quantity

Nothing is written to the database from this screen. Only item ids and
quantities are sent to the server when generating; barcode, name, and price
are always re-read from the database at that point — the browser can't
influence what actually prints.

## Files

```
src/features/barcodes/
  pdf.ts          the label generator (server-only: pdf-lib, bwip-js)
  constants.ts    shared type + gap constants, safe for client import
  queries.ts       item search, batch lookup, inward-document lookup
  actions.ts       search action for the queue builder
  LabelQueue.tsx   client component: search, queue, print-area choice, generate

src/app/(app)/utilities/barcodes/page.tsx    the page, three entry paths
src/app/api/barcodes/pdf/route.ts            POST -> PDF binary
```

New dependencies: `pdf-lib`, `bwip-js`, `@types/bwip-js` (dev). Checked
`npm audit` after adding both — every high-severity finding traces to
pre-existing dev tooling (eslint, next, postcss, sharp), nothing from these
two.
