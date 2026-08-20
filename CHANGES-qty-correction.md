# Quantity correction in the pricing panel

## The bug you actually hit

PricingPanel has had its own Qty input all along. It called
`updateInwardLineQty` — the plain edit — which the immutability trigger
refuses on an approved document. The refusal went to `onError`, the
field snapped back, and it read as a broken input.

Everything I built to handle that case sat in the OTHER tab. The
document view had it; the pricing view, where you actually work with the
invoice in hand, did not. That is why nothing appeared to change three
times running.

## What changed

`src/features/inward/PricingPanel.tsx` only. Type a new quantity on an
approved document and the cell opens a confirm in place:

    Approved: 6 pieces are already in stock and on the bill. Changing to
    5 adjusts stock by -1 and posts the difference to what you owe,
    dated today.
    [reason]
    [Correct quantity and stock]  [Cancel]

One reason, three things move together: stock (its own adjustment
document), the line, and the vendor payable (a delta journal dated
today). On success the cell reports all three:

    6 → 5. Stock 6 → 5. Owed ₹41,199.00 → ₹41,040.90, posted today.

Escape cancels. A non-approved document still takes the plain edit with
no ceremony, exactly as before.

## Verified, not assumed

    npx tsc --noEmit          clean, whole project
    npx next build            ✓ Compiled successfully in 53s
                              ✓ Generating static pages (63/63)
                              exit 0

Run against the real dependency tree with `npm ci`. The two earlier
build failures were a missing package and a strict-mode type error —
both would have been caught by this, and neither will happen again.

## Migrations

All 531 applied migrations are already in supabase/migrations. Nothing
to run.

## Not applied, as you asked

MI 70 / SV17635 is untouched. Open the pricing panel, change 6 to 5,
give a reason. The screen will show you the stock and payable movement
before you confirm.

Three more on BOD-IN-000069 from the same invoice:

    SV17615  4 → 0 or 2   size 2.6 was never billed at all
    SV17592  4 → 2        invoice line 27 bills 2
    SV17619  4 → 2        invoice line 45 bills 2

Note SV17615 cannot go to 0 — the function refuses below 1, because a
line that should not exist is a deletion, not a correction. Take it to
whatever the shelf actually holds and raise the rest as a stock
adjustment.
