import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { to: "/", label: "开始使用" },
  { to: "/landing", label: "了解产品" },
  { to: "/changes", label: "时间线" },
  { to: "/sources", label: "来源" },
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
    <header className="sticky top-0 z-40 border-b border-rule bg-paper">
      <nav
        aria-label="主导航"
        className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-5 sm:px-8"
      >
        <Link
          to="/"
          className="inline-flex min-h-11 items-center font-mono text-xs font-semibold tracking-[0.18em] text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          LIVING ANSWER
        </Link>

        <div className="hidden items-center gap-7 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              aria-current={isActive(link.to) ? "page" : undefined}
              className={[
                "relative inline-flex min-h-11 items-center text-sm font-medium transition-colors duration-150",
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
          className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-ink transition-colors duration-150 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:hidden"
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
          className="border-t border-rule bg-paper-3 px-5 pb-4 pt-2 sm:hidden"
        >
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  aria-current={isActive(link.to) ? "page" : undefined}
                  className={[
                    "flex min-h-11 items-center px-4 text-sm font-medium transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    isActive(link.to)
                      ? "border-l-2 border-accent bg-paper text-ink"
                      : "border-l-2 border-transparent text-ink-subtle hover:bg-paper hover:text-ink",
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
