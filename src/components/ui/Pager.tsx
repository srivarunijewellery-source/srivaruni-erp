import Link from "next/link";

/**
 * Page through a filtered list.
 *
 * The pickable stock grid was capped at 200 rows with no indication that
 * anything was missing — a store with 3,495 items looked like it had
 * 200. Saying "showing 1–60 of 3,495" is half the fix; being able to
 * reach row 61 is the other half.
 *
 * Rendered above AND below the grid: with sixty tiles on screen, a
 * control only at the top means scrolling back up to use it.
 */
export function Pager({
  basePath,
  params,
  page,
  pageSize,
  total,
  shown,
}: {
  basePath: string;
  /** The current query string, so paging keeps every active filter. */
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
  shown: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = page * pageSize + shown;

  function href(next: number) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== "page") qs.set(k, v);
    }
    if (next > 0) qs.set("page", String(next));
    return `${basePath}?${qs.toString()}`;
  }

  // One page of results needs no controls, but the count is still worth
  // showing — it is the difference between "that is everything" and "I
  // wonder if that is everything".
  if (pages <= 1) {
    return (
      <p className="text-2xs text-text-muted">
        {total === 0 ? "Nothing matches these filters." : `${total} items`}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-2xs text-text-muted">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <PageLink href={href(page - 1)} disabled={page === 0}>
          Previous
        </PageLink>
        <span className="text-2xs text-text-subtle">
          {page + 1} / {pages}
        </span>
        <PageLink href={href(page + 1)} disabled={page + 1 >= pages}>
          Next
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-control border border-border px-3 py-1.5 text-2xs text-text-subtle opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      className="rounded-control border border-border px-3 py-1.5 text-2xs hover:border-brand hover:text-brand"
    >
      {children}
    </Link>
  );
}
