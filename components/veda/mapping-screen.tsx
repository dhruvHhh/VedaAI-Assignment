"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuestionList } from "./question-list";
import { AnswerSheetViewer } from "./answer-sheet-viewer";
import type { BBoxRegion } from "./bbox-overlay";
import type { QuestionRow } from "@/hooks/use-toolkit";
import type { AnswerBlock, AnswerSheetPage } from "@/lib/types";

/**
 * Figma "Question - Answer mapping screen" (1:8861) plus the two phone frames
 * (3:1192 question tab / 3:1576 answer tab).
 *
 * Desktop: two independently scrolling columns inside a fixed-height viewport.
 * The 1580px frame height is canvas layout, not intended page scroll — the
 * question list scrolls on its own so the sheet stays visible.
 *
 * Phone: the designer drew the two panels as separate frames, so they become
 * two tabs over the same component tree rather than a split view.
 */

interface MappingScreenProps {
  rows: QuestionRow[];
  unmatchedBlocks: AnswerBlock[];
  pages: AnswerSheetPage[];
  activeQuestionId: string | null;
  onSelectQuestion: (questionId: string | null) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export function MappingScreen({
  rows,
  unmatchedBlocks,
  pages,
  activeQuestionId,
  onSelectQuestion,
  currentPage,
  onPageChange,
}: MappingScreenProps) {
  const [expandedAll, setExpandedAll] = useState(false);
  const [tab, setTab] = useState("questions");

  const activeRow = useMemo(
    () => rows.find((r) => r.question.id === activeQuestionId),
    [rows, activeQuestionId],
  );

  /**
   * Every page the selected answer occupies, in reading order. An answer that
   * runs past the foot of a page continues on the next one, and the viewer
   * only ever shows a single page — without this the continuation is invisible
   * and the answer looks like it stops mid-sentence.
   */
  const answerPages = useMemo(
    () => [...new Set((activeRow?.answerBlocks ?? []).map((b) => b.page))].sort((a, b) => a - b),
    [activeRow],
  );

  /** Regions to outline on the page currently in view. */
  const regions = useMemo<BBoxRegion[]>(() => {
    const blocks = activeRow?.answerBlocks ?? [];

    const matched: BBoxRegion[] = blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.page === currentPage)
      .map(({ block, index }) => ({
        id: block.id,
        bbox: block.bbox,
        // Number the parts when an answer spans pages, so "Q5 2/2" reads as
        // the tail of the answer rather than a second answer to Q5.
        label:
          blocks.length > 1
            ? `Q${activeRow!.question.id} ${index + 1}/${blocks.length}`
            : `Q${activeRow!.question.id}`,
        variant: "matched" as const,
        // Drives the dashed border for low-confidence matches.
        confidence: activeRow!.mapping?.confidence,
      }));

    const unmatched: BBoxRegion[] = unmatchedBlocks
      .filter((block) => block.page === currentPage)
      .map((block) => ({
        id: block.id,
        bbox: block.bbox,
        label: "Unmatched",
        variant: "unmatched" as const,
      }));

    return [...matched, ...unmatched];
  }, [activeRow, currentPage, unmatchedBlocks]);

  const blocksOnPage = useMemo(
    () =>
      [...rows.flatMap((r) => r.answerBlocks), ...unmatchedBlocks].filter(
        (b) => b.page === currentPage,
      ),
    [rows, unmatchedBlocks, currentPage],
  );

  const questionPanel = (
    <QuestionList
      rows={rows}
      unmatchedBlocks={unmatchedBlocks}
      activeQuestionId={activeQuestionId}
      onSelect={onSelectQuestion}
      onFocusBlock={(block) => {
        // Clear the question selection so the orange unmatched box is the
        // only highlight, then jump the viewer to its page.
        onSelectQuestion(null);
        onPageChange(block.page);
        setTab("answer-sheet");
      }}
      expandedAll={expandedAll}
      onToggleExpandAll={() => setExpandedAll((v) => !v)}
    />
  );

  const viewerPanel = (
    <AnswerSheetViewer
      pages={pages}
      currentPage={currentPage}
      onPageChange={onPageChange}
      regions={regions}
      blocksOnPage={blocksOnPage}
      answerPages={answerPages}
      answerLabel={activeRow ? `Q${activeRow.question.id}` : undefined}
    />
  );

  /**
   * One tree for both breakpoints: each panel is instantiated exactly once.
   * Below lg the tab bar switches between them; from lg up the tab bar is
   * hidden and `lg:flex!` overrides Radix's `hidden` on the inactive panel so
   * the two sit side by side.
   */
  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      // `lg:flex-row!` must be important: shadcn's Tabs root ships
      // `data-horizontal:flex-col`, whose attribute selector scores 0,2,0 while
      // a plain `lg:flex-row` scores 0,1,0 (media queries add no specificity),
      // so without it the two panels stack at every width.
      className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row!"
    >
      <TabsList className="grid w-full shrink-0 grid-cols-2 rounded-2xl bg-[var(--veda-white-50)] p-1 lg:hidden">
        <TabsTrigger value="questions" className="veda-p4-medium rounded-xl">
          Questions
        </TabsTrigger>
        <TabsTrigger value="answer-sheet" className="veda-p4-medium rounded-xl">
          Answer Sheet
        </TabsTrigger>
      </TabsList>

      <TabsContent
        forceMount
        value="questions"
        className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden lg:w-[672px] lg:flex-none lg:flex!"
      >
        {questionPanel}
      </TabsContent>
      <TabsContent
        forceMount
        value="answer-sheet"
        className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden lg:flex!"
      >
        {viewerPanel}
      </TabsContent>
    </Tabs>
  );
}
