# Making the quantity editor reachable

    unzip -o srivaruni-qty-reach.zip -d /path/to/srivaruni-erp
    cd /path/to/srivaruni-erp
    python3 wire-qty-correction.py
    npx tsc --noEmit

No new database work. Everything server-side was already live; this is
purely about the editor having a way in.

## Why you could not edit MI 70

On an APPROVED inward the detail page renders:

    document view  ->  InwardDocTable     (read-only, no editor)
    editor view    ->  PricingPanel       (rates and prices, no qty)

LinesSection is the only component that mounts LineQtyEditor, and the
page renders it only when the document is a DRAFT:

    editable={isDraft}

So on an approved document there was no quantity input anywhere on the
screen. The correction function, the trigger exemption, the delta
journal, the paid-bill lock -- all live, all unreachable.

That is the third time in this run I shipped something with no route to
it. Tracing the render path is now part of the job, not an afterthought.

## What changes

The Qty cell in the document table becomes editable, for the owner, on
an approved document. Everywhere else it renders exactly as before.

Typing a new number opens the amber confirm already built into
LineQtyEditor: it names the stock movement and the payable movement,
takes a reason, and posts both.

InwardDocTable gains "use client". It has no server-only imports, so
this is safe; tsc will say otherwise if I am wrong.

## Four edits, two files

    InwardDocTable.tsx   "use client", import, two props, the Qty cell
    page.tsx             passes inwardId and canCorrectQty

Patched rather than replaced: InwardDocTable is 300 lines of cost and tax
columns that have nothing to do with this, and a whole-file copy would
clobber anything changed since.

## Your line, not yet applied

BOD-IN-000070, SV17635, Mens kada 7149154180826, size 2.12.
Invoice 26-27WS54-4143 line 113 bills 5; six were entered.

Dry run, rolled back:

    qty        6 -> 5
    stock      6 -> 5 at Boduppal, on its own adjustment document
    payable    ₹41,199.00 -> ₹41,040.90   (-₹158.10)
    journal    posted, dated today

Nothing paid against this bill and all six pieces still at Boduppal, so
neither guard blocks it. Say the word, or do it yourself once this
deploys.
