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

---

# UPDATE 2 — six corrections

**Nine on top, not ten.** T10 removed from all five sections; 33 necks
plus the mannequin. Checked first that nothing was hanging on any T10 —
deleting a block cascades to its placements, so this would have thrown
away real assignments. All five were empty. The grid now takes its
column count from the data, so a rack that differs again is a seed
change rather than a code change.

**Taller niches.** The spare height at the bottom was doing nothing, so
each niche now carries the tag and name under the photo. A wall of
unlabelled photographs is hard to talk about across a shop floor.

**Sections are nameable.** "Bridal wall, left of the counter" rather than
S3. Owner only: hanging a piece is the counter's daily job, but what a
run of rack is CALLED is a decision everyone else reads off, and a name
that changes under people is worse than a dull one.

**A position table under the grid**, with Print. The grid answers "which
necks are bare" at a glance and does not survive being carried around a
shop floor. The table is the version someone prints, walks the rack
with, arranges from, then comes back to the screen to check. Ordered the
way the wall reads.

**Real filters in the picker.** Category, style, plating and vendor, plus
search and Clear — the same lists the products and stock pages use, from
`getStockFacets`.

That one was my fault in a way that has now happened five times: I built
`DisplayPicker` to take `categories` and `styles`, defaulted them to
empty arrays, and never passed them from the page. Optional props that
default to empty fail silently — the dropdowns simply were not there.
Nothing to see, nothing to error. Defaulting to `[]` is what hid it; the
props are required now, so leaving them out would not compile.

## Verified

    top row              T1..T9, nine per section, all five
    npx tsc --noEmit     clean
    npx next build       ✓ Compiled successfully in 73s
                         ✓ Generating static pages (66/66)

## Migrations

    display_top_row_nine_necks
    rename_display_section

---

# UPDATE 3 — print, price filter, speed

## Print is now the table, landscape, no photos

Printing the page put the whole SCREEN on paper — nav, section tabs, a
grid of photographs — across three portrait pages. Not something anyone
carries round a rack.

Now: landscape, the position table only, everything else hidden.
Position, tag, item, price, in the order the wall reads. Four columns
fit a sheet sideways with room for full item names.

## Price range in the picker

Min and max in rupees beside the other filters, converted to paise
before the query — money is integers here, and a float would round a
₹1,760 piece out of its own range.

## The picker was slow because of the query behind it

`stock_on_hand` joins categories, three attribute tables and vendors,
then runs a correlated photo lookup PER ROW. Measured:

    stock_on_hand, empty search     134ms + 65ms planning
    stock_on_hand, search "neck"    148ms + 26ms planning

and the screen fired that PLUS a second query against item_on_display on
every keystroke and every filter change — two round trips to Mumbai each
time.

Replaced with `display_pick_candidates`, one function that filters,
limits, and only then looks up photos for the surviving rows:

    display_pick_candidates, search "neck"   120ms + 0.05ms planning

Planning drops because a function is planned once rather than per call.
One round trip instead of two. Roughly three times less work per
keystroke.

It also fixes a correctness bug: already-hanging pieces used to be
filtered out in JS AFTER the limit, so a page where the top 120 were all
already placed came back empty instead of showing the next hundred. The
exclusion is now a NOT EXISTS inside the query.

    npx tsc --noEmit   clean
    npx next build     ✓ Compiled successfully in 70s
                       ✓ Generating static pages (66/66)

## Migration

    display_pick_candidates_rpc

---

# UPDATE 4 — place a handful at once, then drag them about

## Bulk placement

Tick pieces in the picker and press **Place N pieces**. They fill the
section's empty necks in reading order, one per neck.

One at a time is right when you know which neck a piece belongs on. It
is the wrong shape entirely for filling a bare section — thirty pieces
meant thirty round trips through the dialog. Choosing the pieces and
choosing the positions are two different jobs; this does the boring one.

With nothing ticked, tapping a piece still means "this one, on this
neck, now". The batch only takes over once something is ticked.

**One per neck, not two.** The first version filled both slots of T1
before touching T2 — six pieces buried on three necks with thirty bare.
A second piece on a neck is a deliberate pairing of a long with a short,
not somewhere to put overflow. The mannequin is skipped for the same
reason: it is an arrangement of up to six, not a spill tray.

## Moving pieces

Drag a photo from one niche to another. Onto a neck with room it JOINS
as the second piece — that is how a long and a short come to share a
neck. Onto a full one the two SWAP, because dragging one piece onto
another is how somebody says "these should trade places", and refusing
there would mean emptying a niche first every single time.

**A tap works too.** HTML5 drag and drop does not exist on a touch
screen, and this gets used on a tablet at the counter. The ⇄ on any
filled niche picks the piece up; a banner says what is being carried;
tapping any niche puts it down. Same two gestures a drag is made of.

Moving is a delete and re-insert rather than an UPDATE, so the history
triggers fire: the old stint closes as 'taken' and a new one opens at
the new neck. An UPDATE would move the piece and leave the record saying
it had been on the first neck all along.

## Verified live, rolled back

    place 6 at once            placed 6, one per neck: T1 T2 T3 T4 T5 T6
    drag T1 onto T2 (has one)  paired — T2:1 T2:2
    drag T3 onto full T2       swapped
    history                    stints close as 'taken' on every move

    npx tsc --noEmit   clean
    npx next build     ✓ Compiled successfully in 67s, 66/66, exit 0

## Migrations

    display_move_and_place_many
    place_many_spreads_one_per_neck

---

# UPDATE 5 — the drag is now a drag

It worked and felt wrong, for three separate reasons.

**The browser drew the ghost.** Native HTML5 drag and drop hands you a
translucent screenshot you cannot style, fires nothing useful on a touch
screen, and needed a whole parallel tap-to-move path for the tablet at
the counter. Replaced with pointer events: one implementation for mouse,
pen and finger, and the thing following the cursor is the photograph
being carried, at 64px with a brand border.

**Every niche lit up at once.** Thirty-four highlighted rectangles said
"something is being dragged", which the pointer already said, and buried
the one fact that mattered. Now only the niche actually under the
pointer lifts and highlights, found with elementFromPoint through a
preview that is pointer-events:none.

**Nothing moved until the server answered.** The piece sat where it
started for a beat, then the whole page re-rendered and it teleported.
The rack now moves locally the instant you let go, mirroring exactly
what move_display_piece does — room on the target means the piece joins
it, a full target means the two trade places. The server call catches up
behind; if it fails the copy snaps back with the reason.

**A tap is still a tap.** A press does not become a drag until the
pointer has travelled six pixels, so tapping a photo opens the photo as
it always did. The click that follows a real drop is swallowed, or the
viewer would open on whatever was just dropped.

Tap-to-move (⇄) is kept for precision and for anyone who cannot make a
drag gesture.

## Two bugs the build caught that testing would not have

The guard `if (!section) return` sat ABOVE two useEffects and a useState.
React counts hooks per render; an early return among them changes the
count and crashes. It only fires on a branch with no sections, and
Boduppal has five — so it would have shipped and broken Zaheerabad on
its first day. My first fix moved it above two of the three hooks and
was still wrong; the lint rule caught that too.

    npx tsc --noEmit   clean
    npx next build     ✓ Compiled successfully, 66/66, exit 0

---

# UPDATE 6 — the browser was dragging the image

Still patchy after the pointer rewrite, and the reason was underneath
all of it: **an `<img>` is draggable by default.**

Pressing on a photo started the BROWSER's own image drag. That hijacks
the gesture — it takes the pointer, paints its own ghost, and my drop
only landed once it gave up. Exactly "I hold the photo, can't move it
directly, and the drop happens after".

Three fixes, all in the same place:

**`draggable={false}` on the img**, plus `onDragStart` prevented and
`-webkit-user-drag: none` for Safari. Nothing native competes now.

**`setPointerCapture` on press.** Every move and the release come back
to the piece even once the pointer has left it. Without it a fast drag
off the niche loses the pointer and the piece lands wherever the browser
last saw it — the other half of "patchy".

**The hover panel is off on draggable pieces.** PhotoThumb magnifies to
340px on hover, which fired mid-drag and covered the very niche being
aimed at. `hoverPanel={false}` on the rack; the picker keeps it, since
that is a browsing list where magnifying helps and nothing is dragged.

Also `touch-action: none` and `select-none` on the button, so a finger
press becomes a drag instead of scrolling the page out from under it.

    npx tsc --noEmit   clean
    npx next build     ✓ Compiled successfully in 63s, 66/66, exit 0

---

# UPDATE 7 — the tab icon, and a regression I caused

## The favicon

There was no icon file at all — `src/app/` had no `icon`, no
`favicon.ico`, nothing — so the browser drew its own generic mark.

Added `src/app/icon.svg` and `src/app/apple-icon.svg`: the lotus and
crown on brand maroon, the same #6b1d2b as the price tags and the
Counter button. Next serves them at whatever size a browser asks for.

Drawn deliberately heavier than the emblem on the tags. A tab icon gets
painted at sixteen pixels, and the first version turned to mush there —
the crown collapsed into a blob and the petals vanished. I only knew
because I rendered it at 16 and magnified it rather than trusting the
256px version. Second attempt: three chunky crown points, one thick
band, three fat petals, nothing thinner than about three units in a 64
unit box. Legible at 32, still readable at 16.

One thing worth knowing: the first file would not have rendered AT ALL.
Its comment contained "--color-brand", and a double hyphen is illegal
inside an XML comment, so the SVG was malformed. It would have shipped
as a broken icon with no error anywhere. The renderer caught it.

## A regression I introduced and have now fixed

To build offline I stub out the Google Font imports in `layout.tsx`,
because the sandbox cannot reach fonts.googleapis.com. On two commits I
restored the wrong file afterwards, and **the stub got committed** —
`Instrument_Sans` and `IBM_Plex_Mono` replaced by placeholder objects.

Production would have fallen back to system fonts on every page. Nothing
would error; it would just quietly stop looking like itself.

Restored from the pre-existing version on main. Worth me finding a
better way to do offline builds than editing a real source file.

    npx tsc --noEmit   clean
    npx next build     ✓ 67/67 routes, exit 0

---

# UPDATE 8 — one save for the whole rearrangement

You were right that the glitchiness was the design, not a bug to chase.

Every drag was its own server call AND a `router.refresh()`. The refresh
re-fetches the rack and replaces the working copy — so a refresh landing
while you were still moving things overwrote what you had just done.
Moves appearing late, and a piece disappearing entirely, are both that.

## What changed

Drags, adds and removals now edit a **working copy** on screen. Nothing
touches the database until **Save the layout**.

A sticky bar appears the moment anything differs: what section it is,
Save, and discard changes. Switching to another section with unsaved
work asks first, because the copy is per rack and only the section on
screen gets written.

`apply_display_layout` writes the arrangement in one call, and touches
only what actually CHANGED — a piece that has not moved keeps its
history stint. Wiping the section and re-inserting would close and
reopen all thirty-three and make "which neck sells" meaningless.

The picker no longer writes either: it hands its choices back and the
rack places them locally. Otherwise adding a piece would have saved
immediately and wiped every unsaved drag.

## What it refuses on save, by name

    sold while you were arranging   names the barcode
    same piece in two places        names the barcode
    more than a neck can take       names the block
    already hanging elsewhere       names the barcode AND where

All-or-nothing: a layout that breaks any rule writes none of itself.

## Verified live, rolled back

    swap two necks in one save      2 removed, 2 added
    history rows created            2 — the untouched pieces kept theirs
    save twice, same transaction    both fine
    a no-change save                writes nothing
    three on one neck               refused, names the piece

## Two bugs found on the way

`_want` is dropped before creating, not just ON COMMIT: the temp table
outlived a call, so a second save in one transaction failed with
"relation _want already exists".

A `saved` state got inserted twice — once where it is used and once in
SectionTitle where it is dead. The build caught it.

    npx tsc --noEmit   clean
    npx next build     ✓ 67/67, exit 0
