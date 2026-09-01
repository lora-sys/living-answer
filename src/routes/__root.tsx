import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../styles.css?url";

import { SiteNav } from "../components/layout/SiteNav";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function NotFound() {
  return (
    <>
      <title>页面不存在 · Living Answer</title>
      <meta name="description" content="当前地址不存在，请返回 Living Answer 开发环境首页。" />
      <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-12 text-ink">
        <section className="w-full max-w-xl rounded-[2px] border border-rule bg-paper-2 p-8 shadow-[var(--shadow-card)] sm:p-12">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            404
          </p>
          <h1 className="mt-5 font-display text-[32px] leading-[38px] font-normal tracking-[-0.01em] sm:text-[44px] sm:leading-[48px]">
            这里没有答案补丁
          </h1>
          <p className="mt-4 leading-7 text-ink-subtle">当前地址不存在，返回开发环境首页继续。</p>
          <Link
            className="mt-8 inline-flex h-12 items-center rounded-[6px] bg-accent px-5 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            to="/"
          >
            返回首页
          </Link>
        </section>
      </main>
    </>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <SiteNav />
        {children}

        <Scripts />
      </body>
    </html>
  );
}
