import { cn } from "@/lib/cn";

/**
 * The SKU tag, treated as a serial number on an instrument.
 *
 * Staff read these character by character off a hang tag all day, so it
 * is always monospace, always tabular, and never wraps. This is the one
 * piece of deliberate visual identity in the app.
 */
export function Barcode({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        // shrink-0 matters: inside a flex row the chip was being squeezed
        // and its last characters clipped, which on a tag code reads as a
        // different tag rather than a truncated one. It keeps its full
        // width and the row wraps instead.
        "tnum inline-block shrink-0 whitespace-nowrap rounded-sm bg-surface-sunken",
        "px-2 py-0.5 font-mono text-2xs tracking-tight text-text-muted",
        className,
      )}
    >
      {code}
    </span>
  );
}
