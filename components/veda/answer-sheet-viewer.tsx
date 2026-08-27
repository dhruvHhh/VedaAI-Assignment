"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { BBoxOverlay, type BBoxRegion } from "./bbox-overlay";
import type { AnswerBlock, AnswerSheetPage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Figma 1:9017 — white card, 1.25px rgba(0,0,0,0.1) border, 20px radius, with
 * a 64px dark header (#303030) carrying the zoom and page controls.
 *
 * Scrolls internally; the page never scrolls with it.
 */

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;

interface AnswerSheetViewerProps {
  pages: AnswerSheetPage[];
  currentPage: number;
  onPageChange: (page: number) => void;
  /** Blocks to outline on the current page. */
  regions: BBoxRegion[];
  /** Used to render a stand-in page when a scan URL is not available. */
  blocksOnPage: AnswerBlock[];
  /**
   * Every page the currently selected answer occupies. When it holds more than
   * one page the answer runs across a page break, and the viewer surfaces the
   * other parts so they are not silently off-screen.
   */
  answerPages?: number[];
  /** Label of the selected question, e.g. "Q5". */
  answerLabel?: string;
}

export function AnswerSheetViewer({
  pages,
  currentPage,
  onPageChange,
  regions,
  blocksOnPage,
  answerPages = [],
  answerLabel,
}: AnswerSheetViewerProps) {
  const [zoom, setZoom] = useState(100);

  const page = useMemo(
    () => pages.find((p) => p.page === currentPage) ?? pages[0],
    [pages, currentPage],
  );

  const pageIndex = pages.findIndex((p) => p.page === currentPage);

  function step(direction: 1 | -1) {
    const i = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
    const next = ZOOM_STEPS[Math.min(Math.max(i + direction, 0), ZOOM_STEPS.length - 1)];
    setZoom(next);
  }

  if (!page) return null;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border-[1.25px] border-[rgba(0,0,0,0.1)] bg-white">
      {/* ------------------------------ header ---------------------------- */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b-[1.25px] border-[rgba(0,0,0,0.1)] bg-[var(--veda-text-primary)] px-4 lg:px-6">
        <h2 className="veda-p3-bold text-[var(--veda-white-80)]">Answer Sheet</h2>

        <div className="flex items-center gap-2 lg:gap-3">
          {/* zoom */}
          <div className="flex items-center gap-2 rounded-lg bg-[var(--veda-white-10)] px-2 py-2 lg:gap-2 lg:px-3">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => step(-1)}
              disabled={zoom === ZOOM_STEPS[0]}
              className="grid size-4 place-items-center text-white disabled:opacity-40"
            >
              <Minus className="size-4 drop-shadow-[0px_4px_4px_rgba(0,0,0,0.25)]" />
            </button>
            <span className="veda-p4 min-w-[38px] text-center font-bold text-white">
              {zoom}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => step(1)}
              disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              className="grid size-4 place-items-center text-white disabled:opacity-40"
            >
              <Plus className="size-4 drop-shadow-[0px_4px_4px_rgba(0,0,0,0.25)]" />
            </button>
          </div>

          {/* pagination */}
          <div className="flex items-center gap-2 rounded-lg bg-[var(--veda-white-10)] px-2 py-2 lg:gap-2 lg:px-3">
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => onPageChange(pages[pageIndex - 1].page)}
              disabled={pageIndex <= 0}
              className="grid size-4 place-items-center text-white disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="veda-p4 whitespace-nowrap font-bold text-white">
              Page {currentPage} of {pages.length}
            </span>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => onPageChange(pages[pageIndex + 1].page)}
              disabled={pageIndex >= pages.length - 1}
              className="grid size-4 place-items-center text-white disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* --------------------- spans-multiple-pages notice ----------------- */}
      {answerPages.length > 1 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[rgba(0,0,0,0.06)] bg-[var(--veda-success-10)] px-4 py-2 lg:px-6">
          <span className="veda-p5 font-bold text-[var(--veda-success)]">
            {answerLabel ?? "This answer"} continues across{" "}
            {answerPages.length} pages
          </span>
          <span className="flex flex-wrap items-center gap-1">
            {answerPages.map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === currentPage}
                className={cn(
                  "veda-p5 rounded-full px-2 py-0.5 font-bold transition-colors",
                  p === currentPage
                    ? "bg-[var(--veda-success)] text-white"
                    : "bg-white text-[var(--veda-success)] hover:bg-white/70",
                )}
              >
                part {i + 1} &middot; p{p}
              </button>
            ))}
          </span>
        </div>
      )}

      {/* ------------------------------- page ----------------------------- */}
      <div className="min-h-0 flex-1 overflow-auto px-2.5 py-4">
        <div
          className="relative mx-auto origin-top transition-[width] duration-200"
          style={{ width: `${zoom}%`, maxWidth: zoom <= 100 ? "659px" : "none" }}
        >
          <div className="relative w-full" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
            {page.imageUrl ? (
              <Image
                src={page.imageUrl}
                alt={`Answer sheet page ${page.page}`}
                fill
                sizes="(max-width: 1024px) 100vw, 660px"
                className="object-contain"
                priority={page.page === 1}
              />
            ) : (
              <MockPage blocks={blocksOnPage} />
            )}

            <AnimatePresence>
              <BBoxOverlay regions={regions} />
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Stand-in page used when an AnswerSheetPage has no imageUrl — ruled paper with
 * each block's transcribed text laid out at its own bbox, so highlights still
 * land on visible writing.
 */
function MockPage({ blocks }: { blocks: AnswerBlock[] }) {
  return (
    <div className="absolute inset-0 bg-white">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 27px, rgba(0,0,0,0.07) 27px 28px)",
        }}
      />
      {blocks.map((block) => {
        const [ymin, xmin, ymax, xmax] = block.bbox;
        return (
          <p
            key={block.id}
            style={{
              top: `${(ymin / 1000) * 100}%`,
              left: `${(xmin / 1000) * 100}%`,
              width: `${((xmax - xmin) / 1000) * 100}%`,
              height: `${((ymax - ymin) / 1000) * 100}%`,
            }}
            className="absolute overflow-hidden text-[13px] leading-[28px] text-[#33417a]"
          >
            {block.transcribedText}
          </p>
        );
      })}
    </div>
  );
}
