# Freight now reaches the vendor's account whenever it is added

## Confirmed correct

The vendor pays the courier and bills it on, so freight belongs in
Vendor payables — which is what the posting already does:

    v_goods := invoice_taxable + additional_costs
    v_total := v_goods + tax
      -> Dr Inventory, Cr Vendor payables

No GST on it, and none is added: all 13 existing charges carry
gst_paise = 0. It also prorates into landed cost, so the pieces carry
it. Both halves were already right.

## The flaw was timing, not treatment

inward_autopost fires ONLY on the transition into approved:

    if TG_OP = 'UPDATE' and old.status = 'approved' then return new; end if;

Add freight BEFORE approving and everything lines up. Add it AFTER and
the cost half runs and the money half does not. That is the whole of
your books gap — seven documents where the difference is the added
charge, penny for penny:

    BOD-IN-000027  freight ₹250  gap ₹250
    BOD-IN-000030  freight ₹100  gap ₹100
    BOD-IN-000031  freight  ₹50  gap  ₹50
    BOD-IN-000032  freight ₹100  gap ₹100
    BOD-IN-000044  freight ₹500  gap ₹500
    BOD-IN-000048  freight  ₹70  gap  ₹70
    BOD-IN-000051  packing ₹700  gap ₹700

## What changed

A statement-level trigger on inward_additional_costs. Insert, update or
delete a charge on an APPROVED inward and the difference posts to the
vendor immediately, dated today.

Statement level with a transition table on purpose: adding three charges
in one go posts ONE journal for the lot, not three.

Refuses silently when a payment has already been allocated — the caller
is a trigger on a cost row, and raising there would block the edit
rather than the posting. Those go to a debit or credit note instead.

Draft and submitted documents are untouched: nothing has posted yet, and
approval picks the charge up on its way through.

### Verified live, rolled back

    BOD-IN-000087, approved, books agreeing

    gap before                 0
    add ₹500 freight           JV/2608/0368 posted, Cr payable ₹500
    gap after                  0
    remove the charge          reversed
    gap after                  0

## Still outstanding

Eight documents, ₹2,703 understated, nothing paid against any of them.
Seven are the freight timing above; BOD-IN-000049 is ₹932 against ₹50 of
freight, so something else moved on that one — worth a look before you
correct it.

Not posted, as you asked. The Books-correction banner on each document
does it in one press with a narration.
