"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Product thumbnail that magnifies on hover.
 *
 * The owner prices a 40-line inward from these images, so the small
 * version has to be big enough to recognise a design and the hover big
 * enough to judge finish and stonework.
 *
 * The magnified panel is rendered into document.body rather than beside
 * the thumbnail. It used to be absolutely positioned inside the cell,
 * which looked right until the panel met the table's own
 * `overflow-x-auto` wrapper: an overflow ancestor CLIPS its absolutely
 * positioned descendants no matter how high their z-index, so the
 * enlarged photo was sliced off at the edge of the scroll box. A portal
 * escapes that entirely, and fixed positioning then lets the panel flip
 * away from whichever screen edge it is near instead of hanging off it.
 */
export function PhotoThumb({
  src,
  alt,
  size = 56,
  hoverPanel = true,
}: {
  src: string | null;
  alt: string;
  size?: number;
  /** Off where the thumbnail is draggable: a magnified panel opening
   *  under the cursor mid-drag fights the gesture and covers the niche
   *  being aimed at. */
  hoverPanel?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  /** Roughly the panel's rendered size, used to keep it on screen. */
  const PANEL = 340;
  const GAP = 12;

  const place = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();

    // Prefer the right of the thumbnail; flip left when that would run
    // off the edge. Same idea vertically, clamped to the viewport so the
    // panel is never half off the top on a row near the header.
    const spaceRight = window.innerWidth - r.right;
    const left =
      spaceRight > PANEL + GAP ? r.right + GAP : Math.max(GAP, r.left - PANEL - GAP);

    const top = Math.min(
      Math.max(GAP, r.top + r.height / 2 - PANEL / 2),
      Math.max(GAP, window.innerHeight - PANEL - GAP),
    );

    setPos({ left, top });
  }, []);

  // A scroll while the panel is open would leave it floating over the
  // wrong row, so it closes rather than chasing the thumbnail.
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

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
    <div
      ref={ref}
      className="relative shrink-0"
      style={{ width: size, height: size }}
      onMouseEnter={hoverPanel ? place : undefined}
      onMouseLeave={hoverPanel ? () => setPos(null) : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        // An <img> is draggable by default, and the browser's own image
        // drag hijacks any pointer gesture that starts on one: you press,
        // the native drag takes over, and the real drop only lands when
        // it gives up. Turning it off is what makes a custom drag feel
        // direct rather than delayed.
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className="h-full w-full select-none rounded-control border border-border object-cover [-webkit-user-drag:none]"
      />

      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            // pointer-events-none so the panel can never swallow a click
            // meant for the row underneath it.
            className="pointer-events-none fixed z-[100]"
            style={{ left: pos.left, top: pos.top }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="max-h-[21rem] max-w-[21rem] rounded-card border border-border bg-surface object-contain shadow-raised"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
