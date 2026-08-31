import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { to: "/changes", label: "变更时间线" },
  { to: "/sources", label: "证据来源" },
] as const;

export function SiteNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (to: string): boolean =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/88 backdrop-blur-md">
      <nav
        aria-label="主导航"
        className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-5 sm:px-8"
      >
        <Link
          to="/"
          className="inline-flex min-h-11 items-center text-base font-semibold tracking-[-0.01em] text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          Living Answer
        </Link>

        <div className="hidden items-center gap-7 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              aria-current={isActive(link.to) ? "page" : undefined}
              className={[
                "relative inline-flex min-h-11 items-center text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
                isActive(link.to) ? "text-ink" : "text-ink-subtle hover:text-ink",
              ].join(" ")}
            >
              {link.label}
              {isActive(link.to) && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-2.5 h-0.5 bg-accent"
                />
              )}
            </Link>
          ))}
        </div>

        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="site-nav-mobile"
          onClick={() => setMobileOpen((open) => !open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:hidden"
        >
          <span className="sr-only">{mobileOpen ? "关闭导航" : "打开导航"}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-5 w-5 fill-none stroke-current stroke-2"
          >
            {mobileOpen ? (
              <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
            ) : (
              <path strokeLinecap="round" d="M3 6h14M3 10h14M3 14h14" />
            )}
          </svg>
        </button>
      </nav>

      {mobileOpen && (
        <div
          id="site-nav-mobile"
          className="border-t border-rule bg-paper-2 px-5 pb-4 pt-2 shadow-[var(--shadow-pop)] sm:hidden"
        >
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  aria-current={isActive(link.to) ? "page" : undefined}
                  className={[
                    "flex min-h-11 items-center rounded-[10px] px-4 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    isActive(link.to)
                      ? "bg-paper text-ink"
                      : "text-ink-subtle hover:bg-paper hover:text-ink",
                  ].join(" ")}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
