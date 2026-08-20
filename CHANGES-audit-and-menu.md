# Stock audit, and the menu

## Stock audit

Pick filters, generate a slip, scan every tag, submit, approve.

**Open count**, as you asked: expected quantity is on the slip. The
discipline is that every tag is physically read — scanned with the gun,
or typed when a label will not read, exactly as the transfer pick works.
Nothing submits until every line carries a number, **including the
zeroes**, because an uncounted line submitted as complete would post as
missing stock.

The scan box holds focus throughout. A counter works two-handed with a
gun and a tray, and every click back into the field is a piece put down.

### What it does with the awkward cases

    tag on the slip          counts one piece, shows counted of expected
    scanned past expected    counted anyway, flagged as over
    tag NOT on the slip      counted anyway, expected 0, flagged
    tag nothing recognises   refused with the tag quoted back
    a label that will not read  type the count against its row

A piece found that the slip did not expect is the single most useful
thing a count turns up. Refusing it would throw the finding away, so it
is recorded with an expected of zero and the variance reads correctly.

### Expected quantity is frozen at slip generation

The shelf keeps moving while the count runs. Comparing a count taken at
4pm against a balance read at 6pm would manufacture a variance out of an
ordinary sale.

### One document, not two hundred and forty-six

Approving posts ONE `count_variance` adjustment with a line per
difference. It deliberately does not call `adjust_item_qty` in a loop —
that function raises its own document per call, which is exactly how 246
corrections became 246 documents and 492 emails on Monday.

Only the owner approves. A clean count still raises the adjustment, empty:
it is the receipt that the shelf was checked and agreed.

One open count per branch, enforced. Two people counting the same shelf
against two slips produce two answers and no way to choose.

### Verified live, rolled back

    slip generated              BOD-AUD-000002 · 6 lines · 8 pieces
    submit before counting      refused, "6 line(s) have not been counted"
    scan SRIVARU01331           counted 1 of 1, complete
    scan it again               counted 2 of 1, over
    scan a tag not on the slip  counted anyway, expected 0
    scan an unknown tag         "No item carries the tag NOPE-123."
    submit                      2 variances
    approve                     BOD-ADJ-000246, 2 lines, +2 net
    adjustment documents        1

## The menu

Was ten groups with Inventory carrying nine mixed items. Now:

    Counter      first, because it is the only group everyone opens daily
    Stock        what we hold: stock, products, audit, adjustments,
                 reconcile, barcode labels
    Transfers    where it is: split out of the old Inventory list
    Purchases    unchanged
    Pricing      gains Price check, which was a pricing question filed
                 under stock
    CRM          loses Discount settings to Settings
    Accounts     reordered: the questions people ask, then the ledgers,
                 then the two pages touched once a year
    Team         unchanged
    Utilities    loses Barcode labels to Stock; what is left is genuinely
                 miscellaneous
    Settings     unchanged front door, resequenced

Nothing was removed. Four things moved to where the person looking for
them would actually look.

## Verified

    npx tsc --noEmit    clean, whole project
    npx next build      ✓ Compiled successfully in 64s
                        ✓ Generating static pages (65/65)
                        ├ ƒ /stock/audit        4.1 kB
                        ├ ƒ /stock/audit/[id]  4.45 kB
                        exit 0
