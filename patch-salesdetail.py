#!/usr/bin/env python3
"""
Swap the bill-number link on the sales detail page for the popup.

Run from the repo root:

    python3 patch-salesdetail.py

Exact-text match, idempotent, refuses rather than half-applying.
"""

import pathlib
import sys

PAGE = pathlib.Path("src/app/(app)/sales/detail/page.tsx")

OLD_CELL = """                      <td className="px-2 py-1.5">
                        <Link
                          href={`${ROUTES.sales}?q=${encodeURIComponent(r.billNo)}`}
                          className="font-mono text-brand hover:underline"
                        >
                          {r.billNo}
                        </Link>
                        <span className="ml-1 text-text-subtle">{r.locationCode}</span>
                      </td>"""

NEW_CELL = """                      <td className="px-2 py-1.5">
                        {/* Opens the invoice over the page rather than
                            navigating to the sales list filtered to one
                            row. A list of one is not what anyone wanted,
                            and coming back cost the filters and the
                            scroll position. */}
                        <BillPeek billId={r.billId} billNo={r.billNo} />
                        <span className="ml-1 text-text-subtle">{r.locationCode}</span>
                      </td>"""

OLD_IMPORT = """import { ItemLink } from "@/components/ui/ItemLink";"""
NEW_IMPORT = """import { ItemLink } from "@/components/ui/ItemLink";
import { BillPeek } from "@/features/salesdetail/BillPeek";"""


def main() -> int:
    if not PAGE.exists():
        print(f"REFUSED: {PAGE} not found. Run this from the repo root.")
        return 1

    text = PAGE.read_text()

    if "BillPeek" in text:
        print("Already applied.")
        return 0

    for name, old in (("bill cell", OLD_CELL), ("import", OLD_IMPORT)):
        if text.count(old) != 1:
            print(
                f"REFUSED: expected exactly one {name} to replace, "
                f"found {text.count(old)}. The file has changed since this "
                f"was written -- nothing has been touched."
            )
            return 1

    text = text.replace(OLD_IMPORT, NEW_IMPORT).replace(OLD_CELL, NEW_CELL)
    PAGE.write_text(text)

    print("Patched src/app/(app)/sales/detail/page.tsx")
    print()
    print("`Link` may now be unused in that file -- tsc will say so if it is.")
    print("It is still used by the grouping chips, so most likely it is fine.")
    print()
    print("Now run:  npx tsc --noEmit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
