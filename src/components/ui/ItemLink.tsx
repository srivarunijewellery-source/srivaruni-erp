import Link from "next/link";
import { ROUTES } from "@/config/nav";

/**
 * An item's name, always a way through to the piece.
 *
 * Wherever a name appears, the next question is nearly always about the
 * piece itself — what it cost, what else is on the shelf, which photo
 * matches the tag in your hand. A name that cannot be opened forces
 * someone to copy the barcode into search on another tab, and enough of
 * that and people stop checking at all.
 *
 * One component rather than a Link written out at each site, so a screen
 * added next month gets the behaviour by default instead of by someone
 * remembering.
 *
 * NOT used on the counter. A cashier mid-sale who taps a product name
 * and lands on a catalogue page has lost the cart, and the piece is in
 * the customer's hand anyway — there is nothing to look up.
 */
export function ItemLink({
  itemId,
  name,
  className,
  title,
}: {
  itemId: string | null | undefined;
  name: string;
  className?: string;
  title?: string;
}) {
  // A custom assembly line has no catalogue entry behind it, so there is
  // nothing to open — render the text rather than a link to nowhere.
  if (!itemId) {
    return (
      <span className={className} title={title ?? name}>
        {name}
      </span>
    );
  }

  return (
    <Link
      href={ROUTES.productDetail(itemId)}
      // Opens alongside rather than replacing: someone checking a line
      // on a transfer or an inward is mid-task, and taking the page away
      // from them loses their place in a hundred-line document.
      target="_blank"
      rel="noreferrer"
      className={`hover:text-brand hover:underline ${className ?? ""}`}
      title={title ?? name}
    >
      {name}
    </Link>
  );
}
