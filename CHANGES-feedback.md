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
