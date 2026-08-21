# Line quantity check

Both pricing paths now compare the count on each line against the count
the document bills, line for line. Nothing else.

## Selva PDF

The parser always read `qty` off every line and the action then dropped
it. It now goes through to the database, which matches on **code + size**
— never a code total, because two sizes of one design are two counts.

The report gains one tally and one list:

    quantity differs   2

    Counts that do not match the document
    Priced either way — a wrong count does not make the rate wrong.
    Correct the quantity on the line and stock and payable move with it.

    SV17592  Bangles 3150041180826 — entered 4, document bills 2 (over)
    SV17619  Bangles 3253024180826 — entered 4, document bills 2 (over)

## CSV

A third dropdown beside SKU and price: **Quantity column**, defaulting to
"Not on this sheet". Guessed from headers named qty, quantity, pcs,
pieces or nos, and changeable. A sheet without one prices exactly as
before and reports no counts.

The result line gains `N counts differ`, with the same list beneath.

## Reported, never enforced

A wrong count does not make the rate wrong, and blocking the price over
a miscount would leave the whole document unpriced. So both paths price
as they always did and simply say what disagrees. Fixing it is the
quantity correction on the line, which moves stock and payable with it.

A blank quantity cell is treated as ABSENT, not as zero: an empty cell
is not a claim that nothing arrived.

## Verified against real data

BOD-IN-000069, with the real rows from invoice 26-27WS54-4143:

    SV17589  entered 4, bills 4  ok
    SV17590  entered 4, bills 4  ok
    SV17616  entered 4, bills 4  ok
    SV17592  entered 4, bills 2  over
    SV17619  entered 4, bills 2  over

Both flagged lines are the two you found by hand.

BOD-IN-000070 now reads all ok, including SV17635 at 5 — the correction
you applied.

    npx tsc --noEmit   clean
    npx next build     ✓ Compiled successfully, 65/65 pages, exit 0

## Migrations, already live

    apply_price_sheet_qty_check
    apply_selva_price_sheet_qty_check

Both were DROP and CREATE rather than REPLACE: the return signature
gained three columns, and Postgres will not change a return type in
place.
