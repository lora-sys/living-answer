import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { goldenDemoFixture } from "../lib/golden-demo-fixture";
import { AnswerHeader } from "../components/read/AnswerHeader";
import { InlinePatchMarker } from "../components/read/InlinePatchMarker";
import { PatchPanel } from "../components/read/PatchPanel";

export const Route = createFileRoute("/read/golden-demo")({
  head: () => ({
    meta: [
      { title: "Living Answer · ChatGPT Free / Plus 精选演示" },
      { name: "description", content: "过去回答已变化关键前提的可视化阅读体验。" },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: ReadGoldenDemo,
});

function ReadGoldenDemo() {
  const [openParagraphId, setOpenParagraphId] = useState<string | null>(null);
  const [activePatchId, setActivePatchId] = useState<string | null>(null);
  const triggeringMarkerRef = useRef<HTMLButtonElement>(null);

  const DESKTOP_PANEL_ID = "patch-panel-desktop";
  const MOBILE_PANEL_ID = "patch-panel-mobile";

  const openPatch = (paragraphId: string, patchId: string) => {
    // Preserve the triggering marker reference for focus return
    const marker = document.querySelector(
      `[data-paragraph-id="${paragraphId}"]`,
    ) as HTMLButtonElement | null;
    if (marker) {
      triggeringMarkerRef.current = marker;
    }
    setActivePatchId(patchId);
    setOpenParagraphId(paragraphId);
  };

  const closePanel = () => {
    setOpenParagraphId(null);
    setActivePatchId(null);
    // Return focus to the triggering marker
    if (triggeringMarkerRef.current) {
      triggeringMarkerRef.current.focus();
      triggeringMarkerRef.current = null;
    }
  };

  // Escape closes the open panel and returns focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openParagraphId !== null) {
        closePanel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openParagraphId]);

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-12 text-stone-950 sm:px-8">
      <div
        className={[
          "mx-auto w-full max-w-5xl",
          openParagraphId ? "flex flex-col lg:flex-row" : "",
        ].join(" ")}
      >
        {/* Back link */}
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-stone-800"
        >
          <span aria-hidden="true">&larr;</span> 返回首页
        </Link>

        {/* Left: Answer body */}
        <article className="min-w-0 flex-1">
          <AnswerHeader fixture={goldenDemoFixture} />

          <section className="rounded-[2rem] border border-stone-300/80 bg-white/80 p-7 shadow-[0_24px_80px_rgba(71,60,48,0.12)] backdrop-blur sm:p-10">
            <h2 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
              ChatGPT Free 与 Plus 的关键差异
            </h2>

            <div className="mt-8 space-y-6 text-base leading-7 text-stone-800 sm:leading-8">
              {goldenDemoFixture.paragraphs.map((paragraph, index) => {
                const pid = `p-${index}`;
                const paragraphPatches = goldenDemoFixture.patches.filter(
                  (p) => p.paragraphId === pid,
                );
                const hasPatches = paragraphPatches.length > 0;
                const isOpen = openParagraphId === pid;

                return (
                  <div
                    key={pid}
                    id={pid}
                    className={[
                      "scroll-mt-24",
                      isOpen ? "ring-2 ring-amber-200 ring-offset-2 rounded-lg" : "",
                    ].join(" ")}
                  >
                    <p className="text-stone-800">{paragraph}</p>

                    {hasPatches && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {paragraphPatches.map((patch) => (
                          <InlinePatchMarker
                            key={patch.id}
                            paragraphId={pid}
                            patchCount={paragraphPatches.length}
                            isOpen={isOpen}
                            panelIds={isOpen ? `${DESKTOP_PANEL_ID} ${MOBILE_PANEL_ID}` : undefined}
                            onClick={() => openPatch(pid, patch.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </article>

        {/* Desktop: right-side panel (only when open) */}
        {openParagraphId && (
          <aside className="hidden lg:block lg:w-[380px] shrink-0">
            <PatchPanel
              patches={goldenDemoFixture.patches}
              activePatchId={activePatchId}
              panelId={DESKTOP_PANEL_ID}
              onClose={closePanel}
            />
          </aside>
        )}
      </div>

      {/* Mobile: fixed bottom sheet (only when open) */}
      {openParagraphId && (
        <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
          <PatchPanel
            patches={goldenDemoFixture.patches}
            activePatchId={activePatchId}
            panelId={MOBILE_PANEL_ID}
            onClose={closePanel}
          />
        </div>
      )}
    </main>
  );
}
