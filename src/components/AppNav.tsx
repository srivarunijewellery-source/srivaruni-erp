"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP } from "@/config/app";
import { NAV_GROUPS, ROUTES, type NavItem } from "@/config/nav";
import { can } from "@/config/roles";
import { signOut } from "@/features/auth/actions";
import { cn } from "@/lib/cn";
import type { CurrentUser } from "@/types/domain";

/**
 * One hamburger, one drawer.
 *
 * The grouped bar worked at eight groups and stopped working at nine:
 * the strip filled the width, dropdowns opened over the page content,
 * and on a laptop the whole thing wrapped onto two lines. Moving it into
 * a side panel means the top bar stops growing as modules are added, and
 * every group is visible at once inside the drawer instead of being
 * hunted for one menu at a time.
 */
export function AppNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Escape closes it, and the page behind must not scroll under it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // Navigating closes the drawer.
  useEffect(() => setOpen(false), [pathname]);

  const visible = (items: readonly NavItem[]) =>
    items.filter((i) => !i.requires || can(user, i.requires));

  const isActive = (href: string) =>
    href === ROUTES.dashboard ? pathname === href : pathname.startsWith(href);

  const groups = NAV_GROUPS.map((g) => ({ ...g, items: visible(g.items) })).filter(
    (g) => g.items.length > 0,
  );

  // Where the person is right now, shown in the bar so the drawer does
  // not have to be opened just to answer "which page is this".
  const here =
    groups
      .flatMap((g) => g.items)
      .find((i) => isActive(i.href))?.label ??
    (pathname === ROUTES.dashboard ? "Today" : "");

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5">
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="flex size-9 shrink-0 flex-col items-center justify-center gap-[3px] rounded-control border border-border hover:bg-surface-sunken"
          >
            <span aria-hidden className="block h-px w-4 bg-text" />
            <span aria-hidden className="block h-px w-4 bg-text" />
            <span aria-hidden className="block h-px w-4 bg-text" />
          </button>

          <Link href={ROUTES.dashboard} className="flex items-baseline gap-2">
            <span className="font-mono text-2xs uppercase tracking-widest text-text-subtle">
              {APP.shortName}
            </span>
            <span className="font-semibold tracking-tight">{APP.name}</span>
          </Link>

          {here && (
            <span className="hidden text-sm text-text-muted sm:inline">
              <span aria-hidden className="mx-1 text-text-subtle">
                /
              </span>
              {here}
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            {can(user, "pos.sell") && (
              <a
                href={ROUTES.pos}
                target="_blank"
                rel="noopener"
                className="rounded-control bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:bg-brand-hover"
              >
                Counter
              </a>
            )}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user.name}</p>
              <p className="font-mono text-2xs uppercase tracking-wide text-text-subtle">
                {user.roleName}
                {user.locationCode ? ` · ${user.locationCode}` : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40">
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-neutral-900/40"
          />

          <nav
            aria-label="Main"
            className="absolute inset-y-0 left-0 flex w-[19rem] max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-surface shadow-raised"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <p className="font-semibold tracking-tight">{APP.name}</p>
                <p className="font-mono text-2xs uppercase tracking-wide text-text-subtle">
                  {user.name} · {user.roleName}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-control px-2 py-1 text-sm text-text-muted hover:bg-surface-sunken hover:text-text"
              >
                Close
              </button>
            </div>

            <div className="flex-1 px-2 py-3">
              <Item
                href={ROUTES.dashboard}
                label="Today"
                active={isActive(ROUTES.dashboard)}
              />

              {groups.map((group) => (
                <div key={group.label} className="mt-4">
                  <p className="px-3 pb-1 text-2xs font-medium uppercase tracking-widest text-text-subtle">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <Item
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={isActive(item.href)}
                      newTab={item.newTab}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div className="border-t border-border px-2 py-2">
              <form action={signOut}>
                <button
                  type="submit"
                  className="w-full rounded-control px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-sunken hover:text-text"
                >
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

function Item({
  href,
  label,
  active,
  newTab,
}: {
  href: string;
  label: string;
  active: boolean;
  newTab?: boolean;
}) {
  const className = cn(
    "flex items-center justify-between rounded-control px-3 py-2 text-sm transition-colors",
    active
      ? "bg-brand-subtle font-medium text-brand"
      : "text-text hover:bg-surface-sunken",
  );

  // A plain anchor, not Link: a new tab is a fresh document, so the
  // client router has nothing to do and next/link would only get in the
  // way of the browser's own handling.
  if (newTab) {
    return (
      <a href={href} target="_blank" rel="noopener" className={className}>
        {label}
        <span aria-hidden className="text-2xs text-text-subtle">
          ↗
        </span>
      </a>
    );
  }

  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={className}>
      {label}
    </Link>
  );
}
