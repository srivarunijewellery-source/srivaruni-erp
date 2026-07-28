import { cn } from "@/lib/cn";

/**
 * Compact attribute chip.
 *
 * Attributes like plating and stone matter when you are looking at one
 * item, and are noise across a hundred rows. They render as small tags
 * in list views and become editable on the detail page.
 */
export function Tag({
  children,
  muted,
  className,
}: {
  children: React.ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-px text-2xs leading-4",
        muted
          ? "border-border bg-surface-sunken text-text-subtle"
          : "border-border bg-surface text-text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
