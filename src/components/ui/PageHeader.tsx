import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Optional breadcrumbs above the title.
 *
 * Detail pages are reached from several directions -- a transfer from
 * the board or the list, a product from the catalogue or an inward
 * document -- so the browser back button is not a reliable way out.
 * A named trail is.
 */
export function PageHeader({
  title,
  description,
  action,
  crumbs,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  crumbs?: Crumb[];
}) {
  return (
    <header className="mb-5">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1 text-2xs text-text-muted">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {c.href ? (
                  <Link href={c.href} className="hover:text-text hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span>{c.label}</span>
                )}
                {i < crumbs.length - 1 && <span aria-hidden>/</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
