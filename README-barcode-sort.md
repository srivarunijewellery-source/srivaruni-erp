# Barcode-descending ordering + /products crash fix

Unzip over the repo root. Every file here is complete — overwrite, don't merge.

    unzip -o srivaruni-barcode-sort.zip -d /path/to/srivaruni-erp
    npx tsc --noEmit
    git add -A && git commit -m "Order every item list by barcode descending; fix /products composite-FK embed"

## Files

    src/lib/sort.ts                        NEW — the shared comparator
    src/features/products/queries.ts       ordering + the /products crash fix
    src/features/pricing/queries.ts        ordering
    src/features/stock/queries.ts          ordering
    src/features/transfers/queries.ts      ordering
    src/features/reconcile/queries.ts      ordering
    supabase/migrations/2026081721*.sql    8 files, ALREADY APPLIED LIVE

## The migrations are already live

All eight were applied to pkubyiwednioztrrkssx before this drop and are
recorded in supabase_migrations.schema_migrations. The files are here so
the repo matches the ledger — do NOT run them again, and do not renumber
them. Four functions changed:

    list_pickable_stock      transfer request grid
    stock_not_in_transfer    "what is not moving" drill-down
    transfer_pivot_items     pivot cell drill-down
    transfer_not_picked      short-pick recovery grid

The batch is two passes because the first pass surfaced a problem: the
five TEST- pieces sort above every SV code in plain text, so barcode
alone put rehearsal stock at the head of every screen. The second pass
sorts is_test first to sink them. Both passes are here because both are
in the ledger.

## The /products crash

Unrelated to the sort work — it has been failing since 9 August.

    PGRST200: Could not find a relationship between 'items' and 'size_id'

items.size_id and items.colour_id are half of COMPOSITE foreign keys —
(size_key, size_id) references attribute_options(attr_key, id) — and
PostgREST cannot resolve a composite relationship from a single-column
embed hint. `size:size_id(value)` therefore threw on every render, which
took the whole Server Component down rather than blanking one column.

listProducts now resolves size and colour in one extra indexed read on
attribute_options, exactly the way getProduct has always done it. At most
120 ids per page — cheaper than the embed it replaces, and it cannot be
broken again by a constraint change.

Nothing else in the app uses that embed; the detail page was already on
the second-read pattern, which is why /products/[id] kept working while
/products did not.

## Ordering rules applied

Item lists  →  barcode descending, is_test first to sink UAT pieces.
Documents   →  unchanged (transfer list by requested_at, transit boxes
               by dispatched_at) — no barcode exists at that level.
One-item    →  unchanged (movements newest-first, ledger oldest-first so
               the running balance accumulates forwards).

Material inwards is deliberately still ASCENDING by item code — tags come
off the printer in code order and get checked against the document that
way. Say the word if you want it flipped to match.
