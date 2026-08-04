import { cn } from "@/lib/cn";
import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function Label({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-2xs font-medium uppercase tracking-wide text-text-muted"
    >
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
/**
 * No width in the base control, on purpose.
 *
 * Baking in w-full meant a caller passing w-28 collided with it at equal
 * CSS specificity, and which one won came down to stylesheet order. That
 * silently stretched narrow inputs to full width and broke the payment
 * allocation row and the attach-item row. Width is now always explicit.
 *
 * Height comes from a token rather than from padding, so a text input, a
 * select and a date box sitting in the same row are exactly the same
 * height. Each used to be sized by its own content, which is why a row
 * of mixed controls stepped up and down.
 *
 * Focus is a soft ring plus a border change, not a border change alone —
 * one grey pixel turning oxblood is nearly invisible on a busy form.
 */
const CONTROL =
  "h-[var(--control-height)] rounded-control border border-border bg-surface " +
  "px-[var(--control-px)] text-sm text-text shadow-[var(--control-shadow)] " +
  "placeholder:text-text-subtle hover:border-border-strong " +
  "focus:border-brand focus:shadow-[var(--control-ring)] focus:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60 " +
  "transition-[border-color,box-shadow] duration-100";

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

/** Multi-line control sharing the same border, focus ring and hover as
 *  every other field. Templates and notes were hand-rolling a <textarea>
 *  with their own classes, which is why they looked unrelated to the
 *  inputs beside them. */
export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        CONTROL.replace("h-[var(--control-height)]", "min-h-24 py-2"),
        "w-full leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-status-danger-fg">{children}</p>;
}
