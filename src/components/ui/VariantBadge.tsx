/**
 * The size or colour that tells two identical-looking pieces apart.
 *
 * One component rather than the same markup copied onto eight card
 * types, so a bangle reads "2.4" the same way on the counter, the stock
 * page, the transfer picker and the sales list. Copies drift; this
 * cannot.
 *
 * Renders nothing when there is no variant, which is most of the
 * catalogue — a design with one size should not carry an empty badge.
 */
export function VariantBadge({
  variant,
  className,
}: {
  variant: string | null | undefined;
  className?: string;
}) {
  if (!variant || variant === "Not set") return null;

  return (
    <span
      className={`ml-1.5 rounded-full bg-brand-subtle px-1.5 py-0.5 text-2xs font-medium text-brand ${className ?? ""}`}
    >
      {variant}
    </span>
  );
}
