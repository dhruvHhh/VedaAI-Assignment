"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { AnswerBlock } from "@/lib/types";

/**
 * Highlight regions drawn over an answer-sheet page.
 *
 * Purely coordinate-driven: it takes normalized bboxes and converts them to
 * percentages, so it works at any zoom level or rendered page size and never
 * needs to know about a specific page, question or image.
 *
 * Figma spec (EL-8e2738a1 / EL-39564457 / EL-e1df1558):
 *   fill   rgba(94,255,53,0.1), border #3DD218 2px, radius 16
 *   label  #34AC15 pill, 12px 12px 0 0 radius, sitting above the box
 */

export const BBOX_VARIANTS = {
  /** Answer matched to the selected question. */
  matched: {
    fill: "rgba(94, 255, 53, 0.1)",
    border: "#3DD218",
    label: "var(--veda-success)",
  },
  /** Writing the pipeline could not attribute to any question. */
  unmatched: {
    fill: "rgba(255, 86, 35, 0.1)",
    border: "var(--veda-orange)",
    label: "var(--veda-orange)",
  },
} as const;

export type BBoxVariant = keyof typeof BBOX_VARIANTS;

/**
 * Mapping.confidence below this reads as "worth a glance" rather than wrong.
 * Tune here — both the dashed highlight and the question list's Review tag
 * derive from this single value.
 *
 * Set to 0.90 from measured output, not intuition. openai/gpt-oss-120b emits a
 * narrow band in practice: ~0.95-0.99 when the answer literally carries the
 * question number, ~0.80-0.88 when the match is inferred from meaning, and it
 * effectively never goes below 0.8 even on deliberately ambiguous fragments.
 * The original 0.6 was therefore unreachable and the flag never fired; 0.90
 * separates "explicitly numbered" from "the model inferred this".
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.9;

/** True only for a confidence value that is present and below the threshold. */
export function isLowConfidence(confidence?: number): boolean {
  return typeof confidence === "number" && confidence < LOW_CONFIDENCE_THRESHOLD;
}

export interface BBoxRegion {
  id: string;
  /** [ymin, xmin, ymax, xmax], normalized 0-1000. */
  bbox: AnswerBlock["bbox"];
  /** Small tag rendered above the box, e.g. "Q2". */
  label?: string;
  variant?: BBoxVariant;
  /**
   * Confidence of the mapping this region came from. A low value dashes the
   * border; the colour is unchanged. Only meaningful for "matched" regions —
   * unmatched blocks keep their own solid treatment.
   */
  confidence?: number;
}

/** Normalized 0-1000 bbox -> CSS percentage box. */
export function bboxToStyle(bbox: AnswerBlock["bbox"]) {
  const [ymin, xmin, ymax, xmax] = bbox;
  return {
    top: `${(ymin / 1000) * 100}%`,
    left: `${(xmin / 1000) * 100}%`,
    height: `${((ymax - ymin) / 1000) * 100}%`,
    width: `${((xmax - xmin) / 1000) * 100}%`,
  };
}

export function BBoxOverlay({
  regions,
  className,
}: {
  regions: BBoxRegion[];
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)}>
      {regions.map((region) => {
        const kind = region.variant ?? "matched";
        const variant = BBOX_VARIANTS[kind];
        // Dashed = same colour, lower certainty. Unmatched stays solid.
        const dashed = kind === "matched" && isLowConfidence(region.confidence);
        return (
          <motion.div
            key={region.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{
              ...bboxToStyle(region.bbox),
              backgroundColor: variant.fill,
              borderColor: variant.border,
            }}
            className={cn(
              "absolute rounded-2xl border-2 shadow-[0_0_0_1.5px_#ffffff]",
              dashed ? "border-dashed" : "border-solid",
            )}
          >
            {region.label && (
              <span
                style={{ backgroundColor: variant.label }}
                // The label is fixed-size while the box scales with the viewer,
                // so at phone width a 16px pill swamps a ~50px-tall region and
                // covers the first line of the answer. Scale it down below lg.
                className="veda-p5 lg:veda-p3-bold absolute -top-5 left-2 rounded-t-lg px-2 py-0.5 text-white lg:-top-7 lg:left-3.5 lg:rounded-t-xl lg:px-3 lg:py-1"
              >
                {region.label}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
