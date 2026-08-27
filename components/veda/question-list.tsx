"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { isLowConfidence } from "./bbox-overlay";
import type { QuestionRow } from "@/hooks/use-toolkit";
import type { AnswerBlock } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Figma 1:8866 — the "Extracted Questions" panel.
 *
 * Each row is a white 16px-radius card; the selected row gains a 2px #FF8D36
 * border and reveals its AI Feedback panel (#F6F6F6, 16px radius).
 *
 * The Figma shows one row expanded as an illustration of the concept. Here the
 * expanded row is whichever question is selected, and selecting drives the
 * highlight on the answer sheet — one selection, one highlight.
 */

type FilterMode = "all" | "review";

interface QuestionListProps {
  rows: QuestionRow[];
  /** Blocks the pipeline could not attribute; surfaced in "Needs review". */
  unmatchedBlocks: AnswerBlock[];
  activeQuestionId: string | null;
  onSelect: (questionId: string | null) => void;
  /** Jumps the viewer to an unmatched block's page. */
  onFocusBlock?: (block: AnswerBlock) => void;
  expandedAll: boolean;
  onToggleExpandAll: () => void;
}

/** A matched mapping the model was unsure about — not an error, just a flag. */
function needsReview(row: QuestionRow): boolean {
  return (
    row.mapping?.status === "matched" && isLowConfidence(row.mapping.confidence)
  );
}

function isUnanswered(row: QuestionRow): boolean {
  return row.mapping?.status === "unanswered";
}

export function QuestionList({
  rows,
  unmatchedBlocks,
  activeQuestionId,
  onSelect,
  onFocusBlock,
  expandedAll,
  onToggleExpandAll,
}: QuestionListProps) {
  const [mode, setMode] = useState<FilterMode>("all");

  /**
   * "Needs review" reorders rather than filters: exceptions rise to the top in
   * priority order and confident matches stay below, de-emphasised but still
   * scrollable.
   */
  const triage = useMemo(() => {
    const unanswered = rows.filter(isUnanswered);
    const lowConfidence = rows.filter(needsReview);
    const confident = rows.filter((r) => !isUnanswered(r) && !needsReview(r));
    return {
      unanswered,
      lowConfidence,
      confident,
      count: unanswered.length + unmatchedBlocks.length + lowConfidence.length,
    };
  }, [rows, unmatchedBlocks]);

  const ordered =
    mode === "all"
      ? rows
      : [...triage.unanswered, ...triage.lowConfidence, ...triage.confident];

  /** Index in `ordered` at which the de-emphasised confident matches begin. */
  const confidentStart =
    mode === "review" ? triage.unanswered.length + triage.lowConfidence.length : -1;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 rounded-[20px] bg-[var(--veda-white-50)] p-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h2 className="veda-p3-bold text-[var(--veda-text-primary)]">
          Extracted Questions{" "}
          <span className="hidden sm:inline">(from question paper)</span>
        </h2>

        <div className="flex items-center gap-2">
          <TriageToggle mode={mode} onChange={setMode} reviewCount={triage.count} />
          <button
            type="button"
            onClick={onToggleExpandAll}
            className="veda-p4-medium shrink-0 rounded-[64px] bg-white py-3 pl-4 pr-5 text-[var(--veda-btn-primary)] transition-colors hover:bg-white/80"
          >
            {expandedAll ? "Collapse All" : "Expand All"}
          </button>
        </div>
      </header>

      {/* The only scrolling region on the left — the page itself never scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {/* Unmatched writing sits directly under the unanswered questions. */}
        {mode === "review" &&
          triage.unanswered.map((row) => (
            <QuestionRowCard
              key={row.question.id}
              row={row}
              isOpen={expandedAll || activeQuestionId === row.question.id}
              isActive={activeQuestionId === row.question.id}
              onSelect={onSelect}
            />
          ))}

        {mode === "review" &&
          unmatchedBlocks.map((block) => (
            <UnmatchedBlockCard
              key={block.id}
              block={block}
              onFocus={() => onFocusBlock?.(block)}
            />
          ))}

        {ordered.map((row, index) => {
          // In review mode the unanswered rows were already rendered above.
          if (mode === "review" && isUnanswered(row)) return null;

          return (
            <div key={row.question.id} className="contents">
              {confidentStart > 0 && index === confidentStart && <ConfidentDivider />}
              <QuestionRowCard
                row={row}
                isOpen={expandedAll || activeQuestionId === row.question.id}
                isActive={activeQuestionId === row.question.id}
                onSelect={onSelect}
                dimmed={mode === "review" && index >= confidentStart}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Segmented All / Needs review control, styled to match the header buttons. */
function TriageToggle({
  mode,
  onChange,
  reviewCount,
}: {
  mode: FilterMode;
  onChange: (mode: FilterMode) => void;
  reviewCount: number;
}) {
  const options: { value: FilterMode; label: string }[] = [
    { value: "all", label: "All" },
    { value: "review", label: "Needs review" },
  ];

  return (
    <div
      role="group"
      aria-label="Filter questions"
      className="flex shrink-0 items-center gap-1 rounded-[64px] bg-white p-1"
    >
      {options.map(({ value, label }) => {
        const selected = mode === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(value)}
            className={cn(
              "veda-p4-medium flex items-center gap-1.5 rounded-[64px] px-3 py-2 transition-colors",
              selected
                ? "bg-[var(--veda-text-primary)] text-white"
                : "text-[var(--veda-text-secondary)] hover:bg-[var(--veda-offwhite-20)]",
            )}
          >
            {label}
            {value === "review" && reviewCount > 0 && (
              <span
                className={cn(
                  "veda-p5 rounded-full px-1.5 font-bold",
                  selected
                    ? "bg-white/20 text-white"
                    : "bg-[var(--veda-amber-bg)] text-[var(--veda-amber)]",
                )}
              >
                {reviewCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ConfidentDivider() {
  return (
    <div className="flex shrink-0 items-center gap-3 pt-1">
      <span className="h-px flex-1 bg-[var(--veda-offwhite-50)]" />
      <span className="veda-p5 text-[var(--veda-text-muted)]">Confident matches</span>
      <span className="h-px flex-1 bg-[var(--veda-offwhite-50)]" />
    </div>
  );
}

/** Muted amber "Review" flag — a nudge, deliberately not an error state. */
function ReviewTag({ confidence }: { confidence?: number }) {
  return (
    <span
      title={
        typeof confidence === "number"
          ? `Low confidence match (${Math.round(confidence * 100)}%)`
          : "Low confidence match"
      }
      className="veda-p5 flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--veda-amber-bg)] px-2 py-1 font-medium text-[var(--veda-amber)]"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="hidden sm:inline">Review</span>
    </span>
  );
}

/** Writing on the sheet that maps to no question. */
function UnmatchedBlockCard({
  block,
  onFocus,
}: {
  block: AnswerBlock;
  onFocus: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onFocus}
      className="flex w-full flex-col gap-2 rounded-2xl border-2 border-dashed border-[var(--veda-orange)]/40 bg-white p-3 text-left transition-colors hover:border-[var(--veda-orange)]/70"
    >
      <div className="flex items-center gap-3">
        <span className="veda-p5 rounded-full bg-[rgba(255,86,35,0.1)] px-2 py-1 font-bold text-[var(--veda-orange)]">
          Unmatched
        </span>
        <span className="veda-p5 text-[var(--veda-text-muted)]">
          Page {block.page}
        </span>
      </div>
      <p className="veda-p4 line-clamp-2 text-[var(--veda-text-secondary)]">
        {block.transcribedText}
      </p>
    </button>
  );
}

function QuestionRowCard({
  row,
  isOpen,
  isActive,
  onSelect,
  dimmed = false,
}: {
  row: QuestionRow;
  isOpen: boolean;
  isActive: boolean;
  onSelect: (questionId: string | null) => void;
  dimmed?: boolean;
}) {
  const { question, grade, mapping } = row;
  const unanswered = isUnanswered(row);
  const lowConfidence = needsReview(row);
  // A score is "good" when it is full marks; anything short shows in red,
  // which is what the Figma's 2/2 green vs 0/2 red badges encode.
  const scoredFull = grade ? grade.score === grade.maxScore : false;

  return (
    <motion.div
      layout
      onClick={() => onSelect(isActive ? null : question.id)}
      className={cn(
        "flex cursor-pointer flex-col gap-6 rounded-2xl bg-white p-3 transition-opacity",
        isActive ? "border-2 border-[#FF8D36]" : "border-2 border-transparent",
        dimmed && !isActive && "opacity-60 hover:opacity-100",
      )}
    >
      <div className="flex items-center gap-3 lg:gap-4">
        {/* number chip */}
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full border-2 border-[var(--veda-white-25)]",
            "text-[20px] font-extrabold tracking-[-0.04em] text-white",
            isActive
              ? "bg-veda-orange shadow-[0px_8px_8.8px_0px_rgba(255,121,80,0.1)]"
              : "bg-[var(--veda-dark-grey-80)] shadow-[0px_4px_16px_0px_rgba(67,67,67,0.1),0px_8px_8.8px_0px_rgba(134,134,134,0.1)]",
          )}
        >
          <span className={question.id.length > 2 ? "text-[13px]" : undefined}>
            {question.id}
          </span>
        </span>

        <p className="veda-p3 min-w-0 flex-1 text-[var(--veda-text-primary)]">
          {question.text}
        </p>

        <div className="flex shrink-0 items-center gap-2 lg:gap-3">
          {lowConfidence && <ReviewTag confidence={mapping?.confidence} />}

          {grade && (
            <span
              className={cn(
                "veda-p3-bold flex items-center gap-1 rounded-full px-3 py-1",
                scoredFull
                  ? "bg-[var(--veda-success-10)] text-[var(--veda-success)]"
                  : "bg-[#FFE9E2] text-[#C0350A]",
              )}
            >
              {grade.score} / {grade.maxScore}
            </span>
          )}
          <span className="grid place-items-center rounded-lg bg-[var(--veda-offwhite-primary)] p-1">
            {isOpen ? (
              <ChevronUp className="size-5 text-[var(--veda-text-primary)]" />
            ) : (
              <ChevronDown className="size-5 text-[var(--veda-text-primary)]" />
            )}
          </span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="feedback"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2.5 rounded-2xl bg-[var(--veda-offwhite-primary)] px-4 py-4 lg:px-6">
              <h3 className="veda-p3-bold text-[var(--veda-text-primary)]">
                AI Feedback
              </h3>
              <p className="veda-p4 text-[#303030]">
                {grade?.feedback ?? "No feedback available for this question."}
              </p>

              {lowConfidence && (
                <p className="veda-p5 mt-1 inline-flex w-fit rounded-full bg-[var(--veda-amber-bg)] px-3 py-1 font-medium text-[var(--veda-amber)]">
                  Matched with{" "}
                  {Math.round((mapping?.confidence ?? 0) * 100)}% confidence —
                  worth a quick check
                </p>
              )}

              {unanswered && (
                <p className="veda-p5 mt-1 inline-flex w-fit rounded-full bg-[#FFE9E2] px-3 py-1 font-bold text-[#C0350A]">
                  No answer found on the sheet
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
