# Editing quantity on an approved inward

    unzip -o srivaruni-qty-correction.zip -d /path/to/srivaruni-erp
    npx tsc --noEmit

    src/features/inward/LineQtyEditor.tsx        modified
    src/features/inward/qtyCorrectionActions.ts  new
    supabase/migrations/2026082002*.sql          4 files, ALREADY LIVE

## Why it was snapping back

Not a bug. A trigger:

    Inward BOD-IN-000069 is approved: 4 pieces were already taken into
    stock and posted to the books. Record a stock adjustment instead.

The editor caught that, reset the field, and printed the reason as small
red text under a dense table. So it read as a broken input rather than
a rule.

## What it does now

Type the new quantity on an approved document and the field turns amber:

    This document is approved, so 4 pieces are already in stock.
    Changing it to 2 will adjust the stock by -2 at the same time.
    [reason]  [Correct quantity and stock]  [Cancel]

Give a reason, and both halves move in one transaction:

    - stock adjusted via adjust_item_qty, which raises its own
      adjustment document with its own number
    - the inward line updated
    - compute_inward_costs re-run, because the bill discount, the
      freight share and the landed unit cost are all functions of qty
    - the change appended to inwards.notes with barcode, before, after,
      who and why

Draft and submitted documents are untouched -- the plain edit still
works there, and nothing has reached stock yet.

## What it still refuses

    not the owner                -> refused
    quantity below 1             -> refused, use a stock adjustment
    blank reason                 -> refused
    document not approved        -> refused, edit the line directly
    more than is on the shelf    -> refused, naming what is left

That last one matters: if pieces have been sold or transferred, taking
them back off this document would drive the balance negative. It is a
different event and needs its own record.

A bare UPDATE on an approved line is still blocked. The trigger only
stands aside for a transaction-scoped flag that is set inside the
SECURITY DEFINER function, after ownership is checked and after the
stock has actually moved.

## Verified live, rolled back

    before                      line qty=4  stock=4
    correct to 0                refused
    blank reason                refused
    correct 4 -> 2              ok, stock 4 -> 2, BOD-ADJ-000245 raised
    correct 2 -> 1              ok, stock 2 -> 1, BOD-ADJ-000246 raised
    after                       line qty=1  stock=1
    bare UPDATE on approved     still refused

## One side effect to decide on

Every correction raises a count_variance adjustment, and every approved
adjustment queues two emails. Correcting the nine over-entered pieces
would put eighteen more in your inbox -- the same flood as Monday.

Suppressing count_variance in trg_adjustment_comms is a small change and
I think it is right: a count correction is deliberate work you are
already sitting in front of, not an event you need telling about. damage
and plain adjustment would keep alerting. Say the word.

---

# UPDATE — the payable now moves too

A quantity correction changes three things, and they move together or
not at all: the stock, the document, and what the vendor is owed.

The first version shipped only the first two. inward_autopost fires ONLY
on the transition into approved:

    if TG_OP = 'UPDATE' and old.status = 'approved' then return new; end if;

so costs recomputed correctly and the journal crediting Vendor payables
kept its original figure. Stock right, cost right, and you owe Selva an
amount the document no longer supports.

## What happens now

A DELTA journal is posted for the difference, dated TODAY:

    increase   Dr Inventory / Dr Input GST   Cr Vendor payables
    decrease   Dr Vendor payables            Cr Inventory / Cr Input GST

Today's date deliberately, so a correction made weeks later does not
reopen a month already reconciled. The original posting is left standing
-- the purchase happened then, the correction happened today, and both
read side by side.

A decrease is the MIRROR entry, not the same entry with minus signs.
journal_lines forbids a negative figure (jl_non_negative), so the first
attempt failed outright on a reduction. Each amount is now placed on the
side its own sign calls for.

## Paid bills are locked

Any payment allocated to the inward and the correction is refused:

    Payment of ₹1,000.00 has already been made against BOD-IN-000069.
    A bill cannot be changed once it is paid -- raise a debit note with
    the vendor instead.

ANY payment, not just full settlement. A part payment has already been
reconciled against a figure, and moving the bill underneath it breaks
that reconciliation just as thoroughly.

## Verified live, rolled back

    payable before          ₹17,021.79
    decrease 4 -> 2         stock 4 -> 2, payable -> ₹16,895.31 (-₹126.48)
    increase 2 -> 5         stock 2 -> 5, payable -> ₹17,085.03 (+₹189.72)
    two delta journals      JV/2608/0341, JV/2608/0342, both dated today
    paid bill               refused, message above

The screen now names the payable movement in its confirmation, because
that is the half nobody expects to move:

    SV17615 4 → 2. Stock 4 → 2. Owed to the vendor ₹17,021.79 →
    ₹16,895.31, posted today.

## NOT touched

The eight pre-existing documents whose payables already disagree with
their recomputed costs. Nothing was posted against them, as you asked.
They remain:

    BOD-IN-000049  ₹932.00      BOD-IN-000032  ₹100.00
    BOD-IN-000051  ₹700.00      BOD-IN-000030  ₹100.00
    BOD-IN-000044  ₹500.00      BOD-IN-000048   ₹70.00
    BOD-IN-000027  ₹250.00      BOD-IN-000031   ₹50.00
