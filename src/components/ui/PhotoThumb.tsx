"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Product thumbnail that magnifies on hover.
 *
 * The owner prices a 40-line inward from these images, so the small
 * version has to be big enough to recognise a design and the hover has
 * to be big enough to judge finish and stonework. Pure CSS, no library.
 */
export function PhotoThumb({
  src,
  alt,
  size = 56,
}: {
  src: string | null;
  alt: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-control border border-dashed border-border-strong bg-surface-sunken text-2xs text-text-subtle"
      >
        none
      </div>
    );
  }

  return (
    <div className="group relative shrink-0" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full rounded-control border border-border object-cover"
      />
      {/* Magnified panel. pointer-events-none so it never blocks the row. */}
      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 z-50 hidden -translate-x-1/2 -translate-y-1/2",
          "group-hover:block",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="max-h-[22rem] max-w-[22rem] rounded-card border border-border bg-surface object-contain shadow-raised"
        />
      </div>
    </div>
  );
}
