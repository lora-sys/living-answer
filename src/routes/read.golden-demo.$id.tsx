import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { GOLDEN_DEMOS } from "../lib/golden-demo-fixture";
import type { GoldenDemoFixture } from "../lib/golden-demo-fixture";
import { AnswerHeader } from "../components/read/AnswerHeader";
import { InlinePatchMarker } from "../components/read/InlinePatchMarker";
import { PatchPanel } from "../components/read/PatchPanel";

export const Route = createFileRoute("/read/golden-demo/$id")({
  head: ({ params }) => {
    const fixture = GOLDEN_DEMOS[params.id];
    const title = fixture ? `Living Answer · ${fixture.displayTitle}` : "Living Answer · 精选演示";
    const description = fixture ? fixture.description : "精选演示阅读体验";
    return {
      meta: [{ title }, { name: "description", content: description }],
      links: [
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      ],
    };
  },
  component: ReadGoldenDemo,
});

function ReadGoldenDemo() {
  const { id } = Route.useParams();
  const fixture = GOLDEN_DEMOS[id] as GoldenDemoFixture | undefined;

  if (!fixture) {
    // Should not reach here due to beforeLoad guard, but defensive fallback
    throw notFound();
  }

  const [openParagraphId, setOpenParagraphId] = useState<string | null>(null);
  const [activePatchId, setActivePatchId] = useState<string | null>(null);
  const triggeringMarkerRef = useRef<HTMLButtonElement>(null);
  const desktopPanelRef = useRef<HTMLElement>(null);

  const DESKTOP_PANEL_ID = "patch-panel-desktop";
  const MOBILE_PANEL_ID = "patch-panel-mobile";

  const openPatch = (paragraphId: string, patchId: string) => {
    if (openParagraphId === paragraphId) {
      closePanel();
      return;
    }
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
    triggeringMarkerRef.current?.focus();
    triggeringMarkerRef.current = null;
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openParagraphId !== null) {
        closePanel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openParagraphId]);

  useEffect(() => {
    if (openParagraphId !== null && desktopPanelRef.current) {
      const focusable = desktopPanelRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable) {
        focusable.focus();
      } else {
        desktopPanelRef.current.setAttribute("tabindex", "-1");
        desktopPanelRef.current.focus();
      }
    }
  }, [openParagraphId]);

  return (
    <main className="min-h-screen bg-paper px-5 py-12 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1 text-sm text-accent-text transition-colors hover:text-accent-active"
        >
          <span aria-hidden="true">&larr;</span> 返回首页
        </Link>
      </div>

      <div
        className={["mx-auto max-w-5xl", openParagraphId ? "flex flex-col lg:flex-row" : ""].join(
          " ",
        )}
      >
        <article className="min-w-0 flex-1">
          <AnswerHeader fixture={fixture} />

          <section className="rounded-[14px] border border-rule bg-paper-2 p-7 shadow-[var(--shadow-card)] sm:p-10">
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {fixture.displayTitle}
            </h1>

            <p className="mt-3 inline-flex items-center rounded-full border border-rule bg-paper px-3 py-1 text-xs font-medium text-ink-subtle">
              {fixture.topic}
            </p>

            <p className="mt-4 text-sm leading-6 text-ink-subtle">{fixture.description}</p>

            <div className="mt-8 space-y-6 text-base leading-7 text-ink-subtle sm:leading-8">
              {fixture.paragraphs.map((paragraph, index) => {
                const pid = `p-${index}`;
                const paragraphPatches = fixture.patches.filter((p) => p.paragraphId === pid);
                const hasPatches = paragraphPatches.length > 0;
                const isOpen = openParagraphId === pid;

                return (
                  <div
                    key={pid}
                    id={pid}
                    className={[
                      "scroll-mt-24",
                      isOpen ? "ring-2 ring-update-soft ring-offset-2 rounded-lg" : "",
                    ].join(" ")}
                  >
                    <p className="text-ink-subtle">{paragraph}</p>

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

        {openParagraphId && (
          <aside ref={desktopPanelRef} className="hidden lg:block lg:w-[380px] shrink-0">
            <PatchPanel
              patches={fixture.patches}
              activePatchId={activePatchId}
              panelId={DESKTOP_PANEL_ID}
              onClose={closePanel}
            />
          </aside>
        )}
      </div>

      {openParagraphId && (
        <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
          <PatchPanel
            patches={fixture.patches}
            activePatchId={activePatchId}
            panelId={MOBILE_PANEL_ID}
            onClose={closePanel}
          />
        </div>
      )}
    </main>
  );
}
