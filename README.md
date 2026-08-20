# Full build — everything outstanding

    unzip -o srivaruni-full-build.zip -d /path/to/srivaruni-erp
    npx tsc --noEmit
    git add -A && git commit -m "Selva integrity + conflict fix, walk-in returns, sales detail popup" && git push

Six source files, three migrations. Complete files — overwrite, don't
merge. No scripts to run.

I checked every one of these against what is actually on main rather
than assuming. Files already correct in the repo are NOT included, so
nothing here is a no-op.

## What is in here and why

### Never applied at all — the walk-in return work

    src/features/pos/ReturnPanel.tsx        repo 15,706 -> 22,681
    src/features/pos/customer-actions.ts    repo  3,124 ->  4,474

This whole drop is still missing from main. A walk-in bill still shows
"A return cannot be taken against it" with a dead button. With these,
the counter can find or add the customer inline and carry on.

The two migrations behind it (set_bill_customer) ARE already live.

### Stale — the Selva fixes from the screenshot

    src/features/inward/selvaPdf.ts         repo  6,818 ->  8,365
    src/features/inward/SelvaPricingTool.tsx repo 11,694 -> 13,053

selvaPdf.ts: the checksum no longer reconciles against the printed
total. On a tax invoice the labels sit in one block and the values in
another, so "TOTAL AMOUNT :" is never followed by its figure and the
regex grabbed the 3 out of "3%". It now checks the document's own S.NO
column — serials run 1..N, so a dropped row is a missing integer.

Verified on both real documents through the browser's own line
assembly: neckset invoice 41/41 lines Rs30,100.00, chain quotation
79/79 lines Rs48,883.00.

SelvaPricingTool.tsx: clicking a conflict no longer wipes the parsed
file and the report. It re-runs the dry run in place, so the line
visibly moves from conflict to priced.

### Stale — the sales detail popup

    src/app/(app)/sales/detail/page.tsx     repo 12,359 -> 12,569

BillPeek.tsx reached the repo but nothing imported it — the page still
linked to /sales?q=<bill no>. That is why a build ran and nothing
changed: dead code compiles fine. This file wires it in.

BillPeek.tsx itself is byte-identical to what is on main, so it is
included only so the folder is complete.

## Migrations — ALREADY LIVE, do not re-run

    20260819160645  set_bill_customer_for_returns
    20260819160655  set_bill_customer_revoke_public
    20260820012901  selva_price_sheet_distinct_price_ambiguity

Recorded in schema_migrations. Files are here so the repo matches the
ledger.

The last one is the same-price conflict fix. Re-run against
BOD-IN-000084 with the real invoice rows, all six lines from the
screenshot resolve and nothing is flagged:

    SV17781  8311126  ->  unchanged Rs430
    SV17783  8311105  ->  priced    Rs340
    SV17784  8311126  ->  priced    Rs430
    SV17791  8311105  ->  priced    Rs340
    SV17800  8311121  ->  priced    Rs430
    SV17809  8311121  ->  unchanged Rs430

## Still open — not in this build

**Selva invoice discounts.** The neckset invoice runs 30,100.00 less
875.93 less 2,045.68 = 27,178.41 taxable, plus 3% IGST = 27,994.00. The
printed Rs430 is before both discounts and before tax, so pricing at
face value overstates landed cost by about 7.5% per piece. It also means
price_mode should be gst_exclusive, not the gst_inclusive currently on
the vendor record.

I need to know whether both discount lines appear on every Selva
invoice before wiring this to the inward header, where
compute_inward_costs already knows how to prorate one.

**SV17813** is named with eight digits (83111137) where every neighbour
has seven. Almost certainly a typo for 8311137, which is why that line
reports as not on the document.
