# Send specific assembly products back for edits

Unzip over the repo root. Complete files — overwrite, don't merge.

    unzip -o srivaruni-assembly-sendback.zip -d /path/to/srivaruni-erp
    npx tsc --noEmit

## Files

    src/features/assembly/AssemblyPricingPanel.tsx   checkboxes + the send-back bar
    src/features/assembly/actions.ts                 sendBackAssemblyProducts
    supabase/migrations/20260818003428_*.sql         ALREADY APPLIED LIVE
    supabase/migrations/20260818003434_*.sql         ALREADY APPLIED LIVE

Both migrations are already on pkubyiwednioztrrkssx and recorded in
schema_migrations. The files are here so the repo matches the ledger.
Do not run them again.

## How it works

On a SUBMITTED assembly the owner now gets a checkbox on every product
card. Tick the ones that are wrong, type what needs fixing, press
"Send N back for edits".

Those products move to a NEW draft document. Their materials travel with
them, because assembly_components hang off assembly_item_id and never
reference the document — so nothing has to be re-scanned at the bench.
The new document opens with the reason as a red banner (the workbench
already renders rejected_reason regardless of status), and the bench can
edit and resubmit it normally.

What is left behind stays submitted and can be approved immediately. A
link to the new document appears on screen after the move.

The whole split is one statement in Postgres, not a delete-and-reinsert
in app code: a half-finished move would leave a product attached to no
document at all, and its materials with it.

## What it refuses, and why

    every product ticked      -> use "Send all back"; moving the lot would
                                 leave an empty submitted shell holding its
                                 own document number
    nothing ticked            -> nothing to move
    blank reason              -> the note is the only thing the bench sees
    document not submitted    -> a draft is already editable; an approved one
                                 has consumed its materials and written
                                 item_costs, so it needs Dismantle
    a product from elsewhere  -> refuses the whole call rather than moving
                                 the ones that did match
    caller is not the owner   -> is_owner() inside the function

All seven were tested against live data inside a transaction and rolled
back. The 40-product BOD-AS-000007 split cleanly: 40 -> 38, new draft
with 2 products and their 5 components, labour rate carried across.

## One design note worth your call

The new document is created as **draft**, not **rejected**. The status
enum has `rejected`, but nothing in the app moves a document out of it —
`submit_assembly` only fires from draft, and `reopenAssembly` only from
submitted — so a rejected document is a dead end. Draft with the reason
attached is the state the bench can actually act on.

If you'd rather it read as "rejected" in the status badge, that needs a
rejected -> draft path first. Say so and I'll add one.

The labour rate on the new document is copied from the source, not read
from business_settings. Each assembly snapshots the rate when it starts,
so if the rate had changed since, reading it fresh would silently
reprice work already done.
