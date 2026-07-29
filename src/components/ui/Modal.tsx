"use client";

import { useEffect } from "react";

/**
 * Centred overlay dialog.
 *
 * Exists because inline expanding panels reflow the toolbar around them:
 * opening the attach-item box shifted the buttons beside it left and
 * right as results loaded. An overlay takes the panel out of flow, so
 * nothing behind it moves.
 */
export function Modal({
  title,
  onClose,
  children,
  width = "max-w-xl",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-neutral-900/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 w-full ${width} rounded-card border border-border bg-surface shadow-raised`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-medium">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-control px-2 py-1 text-sm text-text-muted hover:bg-surface-sunken hover:text-text"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-3">{children}</div>
      </div>
    </div>
  );
}
