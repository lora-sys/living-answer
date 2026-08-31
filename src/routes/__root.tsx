import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../styles.css?url";

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
        <section className="w-full max-w-xl rounded-[14px] border border-rule bg-paper-2 p-8 shadow-[var(--shadow-card)] sm:p-12">
          <p className="text-sm font-semibold tracking-[0.16em] text-muted uppercase">404</p>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            这里没有答案补丁
          </h1>
          <p className="mt-4 leading-7 text-ink-subtle">当前地址不存在，返回开发环境首页继续。</p>
          <Link
            className="mt-8 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
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
        {children}

        <Scripts />
      </body>
    </html>
  );
}
