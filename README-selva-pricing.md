# Selva Pricing Tool

Unzip over the repo root. Complete files — overwrite, don't merge.

    unzip -o srivaruni-selva-pricing.zip -d /path/to/srivaruni-erp
    npm i pdfjs-dist
    npx tsc --noEmit

`pdfjs-dist` is the only new dependency.

## Files

    src/features/inward/selvaPdf.ts            PDF -> priceable rows, in the browser
    src/features/inward/selvaPricingActions.ts server actions
    src/features/inward/SelvaPricingTool.tsx   the tool itself
    src/features/inward/PriceSheetUpload.tsx   MODIFIED: mounts the tool
    supabase/migrations/*.sql                  9 files, ALL ALREADY APPLIED LIVE

PricingPanel.tsx is deliberately NOT changed. The tool is mounted from
PriceSheetUpload, which the pricing screen already renders, so there is
no edit to a 900-line file for the sake of one import.

## Where it appears

Inward -> pricing screen, under the existing spreadsheet card. It stays
collapsed until a PDF is chosen, so it costs nothing on other vendors.

## How it works

1. Choose the Selva quotation PDF. Parsed in the browser — the file
   never leaves the machine.
2. It reconciles against the document's own printed totals and states
   what it read. If the sum disagrees, applying is BLOCKED. A regex that
   silently drops four lines of seventy-nine still looks like it worked.
3. A dry run reports both directions: lines that will be priced, lines
   the quotation does not cover, and quotation lines that never became an
   item on this inward.
4. Ambiguous lines get a chooser. Picking prices the line AND records the
   size on the item, so the same line matches by itself next time.
5. Nothing is written until you press the button.

Rates go in exactly as printed. Selva quote GST-inclusive and the vendor
record now says so, so compute_inward_costs backs the 3% out downstream —
doing it in the tool as well would remove it twice.

## Verified against the real quotation

Their regexes, ported verbatim and run on the sample PDF:

    79 of 79 lines parsed        0 unreadable
    all codes 7 digits           all 79 carried a length
    109 pieces / Rs48,883.00     matches the document's own totals exactly

And against live data via apply_selva_price_sheet, in a rolled-back
transaction: code+size matched prices correctly, a single-price code
priced every size, and a size the quotation did not carry came back
`ambiguous` with its candidates rather than being guessed.

## Two bugs fixed in the handover

**1. The PDF worker would not have loaded.** selvaPdf.ts imported the
pdf.js worker with a `?url` suffix. That is Vite syntax; webpack and
Turbopack do not understand it and the import throws — surfacing as
"That PDF could not be read", which sends you hunting through regexes
for a fault that is not there. Now `new URL(..., import.meta.url)`.

**2. The size was never actually written back.** resolveSelvaLine looked
up the size option with an exact string match on the vendor's value. The
PDF prints `24`; your size list holds `24 inch`. Nothing matched, and an
`if (opt)` guard skipped the write in silence — so the chooser looked
like it worked while leaving the line to ask the same question on every
future shipment. Now matched through `find_size_option`, which applies
`norm_variant` to both sides, and a failure is reported instead of
swallowed.

## One thing needing your call

`find_size_option` returns nothing on a tie, and your size list has
several:

    "30" (12 items)  vs  "30 Inch" (0 items)
    "10" (12)  vs "10.0" (5)      "11" (1)  vs "11.0" (5)
    "9"  (12)  vs "9.0"  (6)      "8"  (1)  vs "8.0"  (1)
    "6"  (1)   vs "6.0"  (1)

These are the same size twice. The tool prices those lines either way
and just declines to record the size, telling you why. 30" matters most
here — the quotation has several 30" chains.

Merging each pair into one option is a small data change: repoint the
items, delete the empty duplicate. Say the word and I'll do it with a
dry run first.

## Migration ledger

All nine are on pkubyiwednioztrrkssx and recorded in schema_migrations.
Do not run them again. Eight came from a parallel session earlier today;
the ninth (find_size_option) is mine. The four superseded ones from that
batch — the v1 function, its revoke, the chain-length helper and the
drop — are included as recorded so the repo matches the ledger, but the
objects they created no longer exist in the database.
