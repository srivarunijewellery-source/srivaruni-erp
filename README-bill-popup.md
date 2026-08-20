# Invoice popup on the sales detail page

    unzip -o srivaruni-bill-popup.zip -d /path/to/srivaruni-erp
    cd /path/to/srivaruni-erp
    python3 patch-salesdetail.py
    npx tsc --noEmit

## What was wrong

The bill number linked to:

    /sales?q=<bill no>

That is the sales LIST filtered to one row. From there the invoice is
still another click away, and coming back has lost the date range, the
filters and the scroll position.

## What it does now

Clicking the bill number opens it over the page: what was bought, who
bought it, who sold it, the tax breakdown, how it was paid, and a
"Print duplicate" button. Closing returns you exactly where you were.

Everything is read through `loadReceiptForReprint`, the same server
action the Reprint button already uses. Deliberately not a new query --
a second reader would be a second set of rules about which stored
figures to trust, right up until the day the two disagree.

Gifts are shown too. They sit on the bill without a price, so they would
otherwise vanish and the piece count would not reconcile against the
slip.

## Files

    src/features/salesdetail/BillPeek.tsx   new
    patch-salesdetail.py                    one-line edit to the page

The page is patched rather than replaced: it is 350 lines of filters and
grouping that have nothing to do with this change, and shipping a whole
copy risks clobbering edits made since. The script matches exact text,
is idempotent, and refuses rather than half-applying.
