"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP } from "@/config/app";
import { NAV_GROUPS, ROUTES, type NavItem } from "@/config/nav";
import { can } from "@/config/roles";
import { signOut } from "@/features/auth/actions";
import { cn } from "@/lib/cn";
import type { CurrentUser } from "@/types/domain";

/**
 * Grouped top navigation.
 *
 * Ten flat items were already crowding the bar and every module adds
 * more. Groups keep the bar scannable and, more usefully, put related
 * work next to each other: everything about buying stock in one menu,
 * everything about what we hold in another.
 *
 * A group renders only if the role can reach at least one page inside it,
 * so nobody opens an empty menu.
 */
export function AppNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  // Close on outside click and on Escape. Without this the menu stays
  // open behind whatever the person does next, which reads as a bug.
  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Navigating closes the menu.
  useEffect(() => setOpen(null), [pathname]);

  const visible = (items: readonly NavItem[]) =>
    items.filter((i) => !i.requires || can(user.role, i.requires));

  const isActive = (href: string) =>
    href === ROUTES.dashboard ? pathname === href : pathname.startsWith(href);

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: visible(g.items) }))
    .filter((g) => g.items.length > 0);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-2.5">
        <Link href={ROUTES.dashboard} className="flex items-baseline gap-2">
          <span className="font-mono text-2xs uppercase tracking-widest text-text-subtle">
            {APP.shortName}
          </span>
          <span className="font-semibold tracking-tight">{APP.name}</span>
        </Link>

        <nav ref={navRef} className="flex flex-1 items-center gap-1">
          <Link
            href={ROUTES.dashboard}
            aria-current={isActive(ROUTES.dashboard) ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-control px-3 py-1.5 text-sm transition-colors",
              isActive(ROUTES.dashboard)
                ? "bg-brand-subtle font-medium text-brand"
                : "text-text-muted hover:bg-surface-sunken hover:text-text",
            )}
          >
            Today
          </Link>

          {groups.map((group) => {
            const groupActive = group.items.some((i) => isActive(i.href));
            const isOpen = open === group.label;
            return (
              <div key={group.label} className="relative">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onClick={() => setOpen(isOpen ? null : group.label)}
                  className={cn(
                    "flex items-center gap-1 whitespace-nowrap rounded-control px-3 py-1.5 text-sm transition-colors",
                    groupActive
                      ? "bg-brand-subtle font-medium text-brand"
                      : "text-text-muted hover:bg-surface-sunken hover:text-text",
                  )}
                >
                  {group.label}
                  <span aria-hidden className="text-2xs opacity-60">▾</span>
                </button>

                {isOpen && (
                  <div className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] overflow-hidden rounded-card border border-border bg-surface shadow-lg">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive(item.href) ? "page" : undefined}
                        className={cn(
                          "block px-3 py-2 text-sm transition-colors",
                          isActive(item.href)
                            ? "bg-brand-subtle font-medium text-brand"
                            : "text-text hover:bg-surface-sunken",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{user.name}</p>
            <p className="font-mono text-2xs uppercase tracking-wide text-text-subtle">
              {user.role}
              {user.locationCode ? ` · ${user.locationCode}` : ""}
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-control px-2 py-1 text-sm text-text-muted hover:bg-surface-sunken hover:text-text"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
