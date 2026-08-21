# Notes and requirements

Counter logs what it heard; you tick off what you have dealt with.

## Where it appears

**Counter** — a `Note` button beside Return and Bills. Logged the moment
it happens, not four hours later when the till is being counted and
nobody remembers the size. The dialog stays open after saving, because
notes arrive in threes at closing time and reopening it for each one is
how the third gets skipped.

**Register close** — a skippable prompt: "Anything to log before
closing?" It asks; the button stores. Deliberately not mandatory: a
required field on the way out of the door gets answered with a full
stop.

**Admin** — Counter → Notes and requirements. Filters on kind, branch,
date range and open/actioned. Checkbox ticks it off.

## Decisions, as you asked

- Description is **free text**. Pinning a note to a design code or a bill
  would report better and would stop it being written at all on a busy
  Saturday.
- **Only the owner** can tick actioned. The flag means "SB has dealt with
  this", and it would stop meaning that the moment anyone could set it.
  Managers see the checkbox greyed with a line saying why.
- **One flag**: ordered IS addressed. A second "closed" state is a second
  thing to maintain, and a status nobody maintains is worse than none.
- **Kinds are a table**, seeded with your five. Adding one is a row, not
  a deploy.

## The store question

A note carries the branch it is ABOUT, not the branch it was typed in.
A manager gets a picker; counter staff get their own branch and no
picker to mis-tap. Enforced in `log_feedback`, not in the form.

It is deliberately NOT hung off `register_sessions`. One manager
covering both stores by phone is entering ZHB's notes while sitting at
BOD, and ZHB's counter closes at a different hour. Tying the record to a
session would file half of them against the wrong branch on the wrong
day.

## Verified

    npx tsc --noEmit     clean, whole project
    npx next build       ✓ Compiled successfully in 65s
                         ✓ Generating static pages (64/64)
                         ├ ƒ /feedback   3.96 kB
                         exit 0

Permissions tested live against real auth identities, rolled back:

    owner logs for ZHB                     ok
    blank description                      refused
    owner ticks actioned                   actioned=true by SB
    unticking clears the stamp             actioned=false, by=null
    ZHB manager logs for BOD               allowed
    ZHB manager ticks actioned             refused, owner only

## Migrations, already live

    feedback_types_and_entries
    feedback_entries_table
    feedback_rls
    log_feedback_function
    set_feedback_actioned_function

---

# UPDATE — managers read across branches

The Boduppal manager could not update notes for Zaheerabad. The cause
was subtler than a missing permission: he COULD write them. The read
policy was

    is_owner() or location_id = my_location_id()

so the note saved and then disappeared, because he was not the owner and
it did not belong to his branch. From his side that is indistinguishable
from having no access — and worse than an honest refusal, because the
note was there, just invisible to the person who had typed it.

Now any manager reads and writes notes for either branch. Counter staff
are still scoped to their own store, so a note cannot be filed against
the wrong branch by a mis-tap on a picker they had no reason to touch.

Ticking a note as actioned is still owner-only. Verified as Vijay
Krishna, the Boduppal manager:

    logs a note for ZHB          allowed
    reads it back                yes
    sees existing ZHB notes      3 visible
    ticks actioned               refused, owner only

Notes carry no cost, no margin and no customer money — they are "someone
asked for 2.12 in rose gold". There is nothing in them that branch
scoping was protecting.

---

# UPDATE 2 — the picker only ever had one branch in it

The permission was right; the dropdown was not. `listStores()` narrows
to a single branch for anyone who is not the owner:

    if (user && !isOwner(user.role) && user.locationId) {
      q = q.eq("id", user.locationId);
    }

So Vijay could log a note for Zaheerabad, and read it back, and there
was no way to choose Zaheerabad because the list handed to the picker
contained only Boduppal.

`listStores()` now takes an opt-in:

    listStores({ allBranches: true })

which widens to both branches for a MANAGER. Off by default and used in
exactly two places — the notes page and the counter's Note button.

The other twelve callers are untouched on purpose. An inward, a return,
a stock audit are done where you are standing, and offering the other
branch in those pickers invites filing against the wrong one. Notes are
the exception because one manager covers both stores by phone.

    npx tsc --noEmit   clean
    npx next build     ✓ Compiled successfully, 65/65, exit 0
