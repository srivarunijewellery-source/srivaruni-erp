"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP } from "@/config/app";
import { NAV, ROUTES } from "@/config/nav";
import { can } from "@/config/roles";
import { signOut } from "@/features/auth/actions";
import { cn } from "@/lib/cn";
import type { CurrentUser } from "@/types/domain";

export function AppNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname();

  const items = NAV.filter((i) => !i.requires || can(user.role, i.requires));

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-2.5">
        <Link href={ROUTES.dashboard} className="flex items-baseline gap-2">
          <span className="font-mono text-2xs uppercase tracking-widest text-text-subtle">
            {APP.shortName}
          </span>
          <span className="font-semibold tracking-tight">{APP.name}</span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {items.map((item) => {
            const active =
              item.href === ROUTES.dashboard
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-control px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-brand-subtle font-medium text-brand"
                    : "text-text-muted hover:bg-surface-sunken hover:text-text",
                )}
              >
                {item.label}
              </Link>
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
