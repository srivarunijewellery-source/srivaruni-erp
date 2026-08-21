# Display racks, auth rate limiting, photo tap

## 1. Display rack — Boduppal

`/display`, also under Stock in the menu.

Five sections, 34 necks each plus the mannequin: ten unbroken across the
top, then three rows of four either side of the half mannequin. Four rows
fit a laptop without scrolling, because the job the grid does is "which
necks are bare and which are crowded" — a question you answer by seeing
the whole section at once.

The niches are therefore small (~116×135), so identification happens on
TAP rather than in the grid. A 116px box cannot tell a long chain from a
short one, and pretending otherwise would make the grid bad at both jobs.
Two pieces on a neck draw as two thumbnails side by side; the mannequin
holds up to six.

### Rules, all in the database

    in stock at this branch      else refused
    not already hanging          refused, NAMING where it is ("S1 · L1")
    within capacity              2 on a neck, 6 on the mannequin
    another branch's rack        refused

### Sold empties the niche by itself

`display_grid` derives it: a placement counts only while the piece is in
stock at that branch. Sold, transferred, written off — the niche is bare
on next load with nothing to run and nothing to clear.

One bug caught in testing: the first version filtered in a WHERE, so a
block whose piece had sold produced no row at all — the niche did not
empty, it DISAPPEARED, and a wall of 34 silently became 33. Moving the
test into the join drops the placement and keeps the block.

### History

`display_history` records every stint, closed on the way out:

    'taken'  moved while still in stock — a rearrangement
    'gone'   left stock while hanging there — that neck sold it

'gone' needed a trigger on `stock_balances`: nothing deletes a placement
when a piece sells, so without it the stint stayed open forever and
"which neck sells" could never be answered — the one question the board
exists for.

Verified: place → move → sell produces `T1:gone → L5:taken`.

### The badge

`item_on_display` gives products, product detail and stock a label in ONE
indexed read, so no listing screen learns the rack tables.

## 2. Auth rate limiting — fixed

The 429s and the "permission denied for function is_owner" errors were
one cause. `middleware.ts` calls `supabase.auth.getUser()` on every
request — a network call to Supabase Auth — and Next prefetches links as
they scroll into view. Each prefetch is an `.rsc` request that runs the
middleware and then renders, so two auth calls per link. A grid of sixty
cards generated a hundred-odd auth calls in seconds; Supabase returned
429, the session failed to resolve, the query ran as `anon`, and
PostgREST refused it.

Prefetches now skip the check entirely. A prefetch renders a page nobody
has navigated to; if they do navigate, THAT request is gated properly.
Nothing a user can see is weakened.

## 3. Photo tap

The product card was one `<Link>`, so tapping the photo — the obvious
gesture when you want a better look — navigated to the product page.

Now the photo opens the photo (full screen, Escape or tap to close) and
the name opens the product. New `PhotoZoom` component; `stopPropagation`
is what makes it work inside a card that is still partly a link.

## Verified

    npx tsc --noEmit   clean
    npx next build     ✓ Compiled successfully in 56s
                       ✓ Generating static pages (66/66)
                       exit 0

## Migrations, already live

    display_racks_tables            seed_boduppal_display_racks
    display_grid_view               display_grid_keeps_empty_niches_v2
    display_place_and_clear_functions
    display_history                 display_history_triggers
    close_display_stint_when_stock_leaves
    item_on_display_view

---

# UPDATE — the today page was the one you meant

`SoldItemsGrid` — the sold-items cards on the today page and the
dashboard — already had a tap-to-peek from an earlier session, but it
was TWO taps: first scaled the thumbnail to 2.2× in place, second opened
the product page.

That is a gesture nobody guesses, and it still left the product page one
stray tap away from where you were trying to look at a photo. The
transform trick was there to stop the card widening and giving the page
a horizontal scroll — a real problem, solved the hard way.

Now the same as the product grid: one tap on the photo opens the photo
full size, with barcode, name and what it made in the caption. The item
name is the link to the product. Two intentions, two targets, no scale
transform and no layout to protect.

One component, so the today page and the dashboard both change.

    npx tsc --noEmit   clean
    npx next build     ✓ Compiled successfully in 67s
                       ✓ Generating static pages (66/66)
