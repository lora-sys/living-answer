import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { GOLDEN_DEMOS } from "../lib/golden-demo-fixture";
import type { GoldenDemoFixture } from "../lib/golden-demo-fixture";
import { PATCH_TYPE_LABELS, formatDateYYYYMMDD } from "../lib/read-presentation";
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
    <main className="min-h-screen bg-paper px-5 py-10 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-[1120px]">
        <Link
          to="/"
          className="mb-8 inline-flex min-h-11 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent transition-colors duration-150 hover:text-accent-active"
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
          <div className="mb-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              GOLDEN DEMO READ
            </p>
            <h1 className="mt-3 font-display text-[32px] leading-[38px] font-normal text-ink sm:text-[42px] sm:leading-[46px]">
              {fixture.displayTitle}
            </h1>
            <p className="mt-3 h-[3px] w-24 bg-rule-strong" aria-hidden="true" />
          </div>

          <div className="border-2 border-rule-strong bg-paper-3 p-5 shadow-[var(--shadow-card)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-display text-[32px] leading-[38px] font-normal text-ink sm:text-[42px] sm:leading-[46px]">
                {fixture.displayTitle}
              </h1>
              <span className="inline-flex shrink-0 items-center gap-2 border border-update bg-update-soft px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-update">
                <span aria-hidden="true" className="h-1.5 w-1.5 bg-update" />
                {fixture.patches.length} PATCHES
              </span>
            </div>

            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              {fixture.topic}
            </p>

            <p className="mt-4 max-w-[68ch] text-sm leading-6 text-ink-subtle sm:text-base sm:leading-7">
              {fixture.description}
            </p>

            <div className="mt-7 flex flex-wrap gap-2 border-t border-rule pt-5">
              {fixture.patches.map((patch, index) => (
                <button
                  key={patch.id}
                  type="button"
                  onClick={() => openPatch(patch.paragraphId, patch.id)}
                  className={[
                    "inline-flex min-h-11 items-center justify-center gap-1.5 border border-rule-strong bg-paper-3 px-3 py-2",
                    "font-mono text-[11px] uppercase tracking-[0.06em] text-ink-subtle transition-all duration-120 hover:border-accent hover:text-ink hover:shadow-[2px_2px_0_var(--color-accent)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent shadow-[var(--shadow-card)]",
                  ].join(" ")}
                >
                  <span className="font-mono text-[11px] text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {PATCH_TYPE_LABELS[patch.type]} · {formatDateYYYYMMDD(patch.asOf)}
                </button>
              ))}
            </div>

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
                      isOpen
                        ? "border-l-[3px] border-l-update bg-paper-2 pl-4 pr-3 py-2"
                        : "",
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
          </div>
        </article>

        {openParagraphId && (
          <aside
            ref={desktopPanelRef}
            className="sticky top-24 hidden h-fit min-w-0 lg:block lg:w-[380px] shrink-0"
          >
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
