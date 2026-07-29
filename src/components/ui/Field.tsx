import { cn } from "@/lib/cn";
import { forwardRef } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

export function Label({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-text">
      {children}
    </label>
  );
}

/**
 * No width in the base control, on purpose.
 *
 * Baking in w-full meant a caller passing w-28 collided with it at equal
 * CSS specificity, and which one won came down to stylesheet order. That
 * silently stretched narrow inputs to full width and broke the payment
 * allocation row and the attach-item row. Width is now always explicit.
 */
const CONTROL =
  "rounded-control border border-border bg-surface px-3 py-2 text-sm " +
  "placeholder:text-text-subtle focus:border-brand focus:outline-none " +
  "disabled:opacity-50";

/** forwardRef so callers can focus it, which the add-item dialog does
 *  after every save to keep a carton moving without touching the mouse. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, "w-full", className)} {...props} />;
  },
);

/** Fixed-width input for table cells and inline edits. */
export function NarrowInput({
  widthClass = "w-24",
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { widthClass?: string }) {
  return <input className={cn(CONTROL, widthClass, "shrink-0", className)} {...props} />;
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, "w-full", className)} {...props} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-status-danger-fg">{children}</p>;
}
