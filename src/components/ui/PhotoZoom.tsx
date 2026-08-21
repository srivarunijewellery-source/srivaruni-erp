"use client";

import { useEffect, useState } from "react";
import { PhotoThumb } from "./PhotoThumb";

/**
 * A thumbnail that opens the picture instead of navigating.
 *
 * On a phone the whole product card is a link, so a tap on the photo --
 * the obvious thing to do when you want a better look at a piece --
 * took you to the product page instead. That is a different intention
 * wearing the same gesture: the photo means "show me this", the name
 * means "take me there".
 *
 * stopPropagation matters more than the modal: without it the tap
 * bubbles to the enclosing Link and navigates anyway, so the viewer
 * would open and be torn down in the same frame.
 */
export function PhotoZoom({
  src,
  alt,
  size = 72,
  caption,
}: {
  src: string | null;
  alt: string;
  size?: number;
  caption?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={`View photo of ${alt}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (src) setOpen(true);
        }}
        className="shrink-0 rounded-control focus:outline-none focus:ring-2 focus:ring-brand"
      >
        <PhotoThumb src={src} alt={alt} size={size} />
      </button>

      {open && src && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-[85vh] max-w-full rounded-card object-contain"
          />
          {caption && (
            <p className="absolute bottom-6 left-0 right-0 px-4 text-center text-sm text-white">
              {caption}
            </p>
          )}
          <span className="absolute right-4 top-4 rounded-control bg-white/15 px-3 py-1.5 text-sm text-white">
            Close
          </span>
        </div>
      )}
    </>
  );
}
