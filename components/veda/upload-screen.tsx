"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { FileUpload } from "@/components/aceternity/file-upload";
import { AvatarCluster } from "./avatar-cluster";
import { validateFile } from "@/lib/api";
import type { UploadedFile, UploadSlot } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Figma "Upload Screen - Empty State" (1:8744) / "- filled state" (1:8797),
 * plus their phone variants (1:10442 / 3:956).
 *
 * One tree for both breakpoints. The only genuine structural difference in the
 * Figma is the heading: desktop splits it into "Upload" + an orange pill and
 * adds a subtitle, phone uses a single centred two-line 24px heading. Both are
 * rendered here and toggled by breakpoint.
 */

interface UploadScreenProps {
  questionPaper?: UploadedFile;
  answerSheet?: UploadedFile;
  onSelect: (slot: UploadSlot, file: File) => void;
  onRemove: (slot: UploadSlot) => void;
  bothUploaded: boolean;
  onStart: () => void;
  /** Human-readable failure from the last run, if it failed. */
  error?: string | null;
  /** Raw provider text behind `error`, shown only on request. */
  errorDetail?: string | null;
  /** Clears the files and the error, back to an empty upload screen. */
  onStartOver: () => void;
}

export function UploadScreen({
  questionPaper,
  answerSheet,
  onSelect,
  onRemove,
  bothUploaded,
  onStart,
  error,
  errorDetail,
  onStartOver,
}: UploadScreenProps) {
  const [errors, setErrors] = useState<Partial<Record<UploadSlot, string>>>({});

  function handleSelect(slot: UploadSlot, file: File) {
    const problem = validateFile(file);
    if (problem) {
      setErrors((prev) => ({ ...prev, [slot]: problem }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    onSelect(slot, file);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-1 py-8 lg:gap-9 lg:px-0">
      <div className="flex w-full flex-col items-center gap-5 lg:w-auto">
        {/* ------------------------------ heading ------------------------- */}
        <div className="flex flex-col items-center gap-2">
          {/* desktop: "Upload" + orange pill + subtitle */}
          <div className="hidden items-center justify-center gap-3 lg:flex">
            <span className="veda-h1 text-[var(--veda-dark-grey)]">Upload</span>
            <span className="rounded-lg bg-[rgba(255,147,80,0.15)] px-2 py-1">
              <span className="veda-h1 text-[var(--veda-orange)]">
                Question Paper &amp; Answer Sheets
              </span>
            </span>
          </div>
          <p className="veda-p1 hidden text-center text-[var(--veda-text-primary)] lg:block">
            Upload both files to get started
          </p>

          {/* phone: single centred heading */}
          <h1 className="text-center text-[24px] font-bold leading-[1.2] tracking-[-0.04em] text-[var(--veda-dark-grey)] lg:hidden">
            Upload Question Paper
            <br />&amp; Answer Sheets
          </h1>
        </div>

        <AvatarCluster />

        {/* --------------------------- dropzone card ----------------------- */}
        <div className="flex w-full flex-col items-center gap-4">
          <div className="w-full rounded-3xl bg-[var(--veda-white-50)] p-3 lg:w-[789px]">
            <div className="flex flex-col gap-4 lg:h-[181px] lg:flex-row lg:items-stretch">
              <FileUpload
                labelPrefix="Upload"
                labelHighlight="Question Paper"
                file={questionPaper}
                error={errors.questionPaper}
                onSelect={(file) => handleSelect("questionPaper", file)}
                onRemove={() => onRemove("questionPaper")}
              />
              <FileUpload
                labelPrefix="Upload"
                labelHighlight="Answer Sheet"
                file={answerSheet}
                error={errors.answerSheet}
                onSelect={(file) => handleSelect("answerSheet", file)}
                onRemove={() => onRemove("answerSheet")}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------- CTA ------------------------------- */}
      <div className="flex flex-col items-center gap-3">
        <motion.button
          type="button"
          disabled={!bothUploaded}
          onClick={onStart}
          whileHover={bothUploaded ? { scale: 1.02 } : undefined}
          whileTap={bothUploaded ? { scale: 0.98 } : undefined}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className={cn(
            "flex items-center gap-2 rounded-[64px] border-2 py-3 pl-6 pr-5",
            "border-[var(--veda-white-15)] bg-[var(--veda-text-primary)]",
            bothUploaded
              ? "opacity-100 shadow-[0px_4px_5px_0px_rgba(0,0,0,0.12)]"
              : "cursor-not-allowed opacity-25",
          )}
        >
          <span className="veda-p4-medium text-white">Start Mapping</span>
          <ArrowRight className="size-5 text-white" />
        </motion.button>

        {error ? (
          <ExtractionError
            message={error}
            detail={errorDetail}
            onRetry={onStart}
            onStartOver={onStartOver}
          />
        ) : (
          <p className="veda-helper max-w-[285px] text-center text-[var(--veda-text-secondary)] lg:max-w-none">
            Once both files are uploaded, you&rsquo;ll able to map answers with
            questions
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Shown in place of the helper text when a run fails.
 *
 * It sits directly under "Start Mapping" on purpose. The previous version put a
 * raw error string at the bottom of the viewport, far from the button you would
 * press to recover — so the message and the fix were nowhere near each other.
 *
 * The files stay loaded through a failure, so "Try again" re-runs the same two
 * documents in one click. The provider's own text lives behind a disclosure:
 * available when something needs diagnosing, out of the way when it does not.
 */
function ExtractionError({
  message,
  detail,
  onRetry,
  onStartOver,
}: {
  message: string;
  detail?: string | null;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex w-full max-w-[420px] flex-col items-center gap-3 rounded-2xl border border-[rgba(192,53,10,0.25)] bg-[rgba(255,86,35,0.06)] px-5 py-4"
    >
      <p className="veda-p4-medium text-center text-[#C0350A]">{message}</p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="veda-p4-medium rounded-[64px] bg-[var(--veda-text-primary)] px-5 py-2 text-white transition-transform hover:scale-[1.02]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="veda-p4-medium rounded-[64px] px-4 py-2 text-[var(--veda-text-secondary)] underline-offset-4 hover:underline"
        >
          Start over
        </button>
      </div>

      {detail ? (
        <details className="w-full">
          <summary className="veda-p5 cursor-pointer text-center text-[var(--veda-text-muted)]">
            Technical details
          </summary>
          <p className="veda-p5 mt-2 max-h-28 overflow-y-auto break-words text-[var(--veda-text-secondary)]">
            {detail}
          </p>
        </details>
      ) : null}
    </motion.div>
  );
}
