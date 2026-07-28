import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, Ref, SelectHTMLAttributes } from "react";

export function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-text">
      {children}
    </label>
  );
}

const CONTROL =
  "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm " +
  "placeholder:text-text-subtle focus:border-brand focus:outline-none";

/** React 19 allows ref as a plain prop on function components, but the
 *  attribute types do not include it, so declare it explicitly. */
export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(CONTROL, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, className)} {...props} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-status-danger-fg">{children}</p>;
}
