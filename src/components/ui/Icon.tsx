import { cn } from "@/lib/cn";

/**
 * A deliberately tiny icon set, drawn inline.
 *
 * No icon library: the app needs about eight glyphs, and pulling in a
 * package for that costs a dependency, a bundle, and a second styling
 * system that does not know about the design tokens. These take
 * `currentColor`, so an icon inside a button is automatically the right
 * colour in every state without any per-icon styling.
 *
 * Stroke width 1.75 to match the select chevron in globals.css — at 1.5
 * they looked faint next to the text, at 2 they looked like a different
 * family.
 */
type IconProps = {
  className?: string;
  /** Tailwind size class. Defaults to the size that sits well beside 14px text. */
  size?: string;
};

function base(className?: string, size = "size-4") {
  return cn(size, "shrink-0", className);
}

const SVG_PROPS = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function SettingsIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.3 4.7l-1.3 1.3M6 14l-1.3 1.3M15.3 15.3L14 14M6 6L4.7 4.7" />
    </svg>
  );
}

export function ChevronDownIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}

export function CalendarIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" />
    </svg>
  );
}

export function PlusIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  );
}

export function CheckIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

export function AlertIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <path d="M10 3.5l7 12.5H3l7-12.5z" />
      <path d="M10 8v3.2M10 13.6v.05" />
    </svg>
  );
}

export function ClockIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.2l2.6 1.8" />
    </svg>
  );
}

export function RefreshIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <path d="M16.5 8.5A6.5 6.5 0 0 0 5 6.2M3.5 11.5A6.5 6.5 0 0 0 15 13.8" />
      <path d="M16.5 4.5v4h-4M3.5 15.5v-4h4" />
    </svg>
  );
}

export function ExternalIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <path d="M11 4.5h4.5V9M15.5 4.5L9 11" />
      <path d="M15.5 12v3a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5h3" />
    </svg>
  );
}

export function CopyIcon({ className, size }: IconProps) {
  return (
    <svg {...SVG_PROPS} className={base(className, size)}>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
      <path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v6.5A1.5 1.5 0 0 0 5 13h2" />
    </svg>
  );
}
