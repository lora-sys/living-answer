import { createFileRoute } from "@tanstack/react-router";

import { APP_NAME, PRODUCT_TAGLINE, READY_MESSAGE, STACK_LABEL } from "../lib/app-info";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Living Answer · 开发环境已准备完成",
      },
      {
        name: "description",
        content: "Living Answer 为过去的知乎回答补充今天已经发生变化的关键前提与证据。",
      },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "alternate icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="relative isolate flex min-h-screen items-center overflow-hidden bg-[#f5f3ee] px-5 py-12 text-stone-950 sm:px-8">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_top_left,rgba(217,119,87,0.2),transparent_58%)]"
      />

      <section className="mx-auto w-full max-w-4xl rounded-[2rem] border border-stone-300/80 bg-white/80 p-7 shadow-[0_24px_80px_rgba(71,60,48,0.12)] backdrop-blur sm:p-12 lg:p-16">
        <div className="mb-16 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm font-semibold tracking-[0.18em] text-stone-600 uppercase">
            答案补丁 · Foundation 0
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
            />
            {READY_MESSAGE}
          </div>
        </div>

        <div className="max-w-3xl">
          <h1 className="text-5xl font-semibold tracking-[-0.045em] text-balance sm:text-7xl">
            {APP_NAME}
          </h1>
          <p className="mt-7 text-lg leading-8 text-stone-700 sm:text-xl sm:leading-9">
            {PRODUCT_TAGLINE}
          </p>
        </div>

        <div className="mt-14 border-t border-stone-200 pt-6">
          <p className="text-sm font-medium text-stone-500">{STACK_LABEL}</p>
        </div>
      </section>
    </main>
  );
}
