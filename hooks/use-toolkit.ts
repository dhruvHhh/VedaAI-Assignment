"use client";

import { useCallback, useMemo, useState } from "react";
import { describeFile, runExtractionPipeline } from "@/lib/api";
import type {
  AnswerBlock,
  ExtractionResult,
  FlowStage,
  GradeResult,
  Mapping,
  Question,
  UploadedFile,
  UploadSlot,
} from "@/lib/types";

/**
 * Turns a thrown pipeline error into something a teacher can act on.
 *
 * The raw text is written for whoever is debugging: a failed Gemini call
 * arrives as three lines of SDK output carrying the endpoint URL, the model id
 * and a nested JSON payload with `@type` and `domain` fields. Showing that to
 * someone marking papers tells them nothing about what to do next, so it is
 * kept — see `errorDetail` — but not put in front of them.
 *
 * Errors are prefixed with the route that threw (`/api/extract-answers: ...`),
 * which is the one genuinely useful part: it says which step failed.
 */
const STEP_LABELS: Record<string, string> = {
  "extract-questions": "Reading the question paper",
  "extract-answers": "Reading the answer sheet",
  "map-answers": "Matching answers to questions",
  grade: "Grading the answers",
};

function friendlyError(raw: string): string {
  const step = Object.keys(STEP_LABELS).find((route) =>
    raw.includes(`/api/${route}`),
  );
  const what = step ? STEP_LABELS[step] : "Extraction";

  const why = /rate limit|\b429\b|quota|resource_exhausted|tokens per/i.test(raw)
    ? "The AI service is busy right now."
    : /api key|\b401\b|\b403\b|unauthenticated|invalid.*key/i.test(raw)
      ? "The AI service rejected our credentials."
      : /timeout|etimedout|aborted|fetch failed|enotfound|network/i.test(raw)
        ? "The AI service could not be reached."
        : "Something went wrong on the way back.";

  return `${what} failed. ${why}`;
}

/** A question joined to its mapping, grade and answer blocks for rendering. */
export interface QuestionRow {
  question: Question;
  mapping?: Mapping;
  grade?: GradeResult;
  answerBlocks: AnswerBlock[];
}

interface SlotState {
  file: File;
  meta: UploadedFile;
}

export function useToolkit() {
  const [stage, setStage] = useState<FlowStage>("upload");
  const [slots, setSlots] = useState<Partial<Record<UploadSlot, SlotState>>>({});
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The raw provider error, kept for the details disclosure and the console. */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  /** The question whose answer region is highlighted on the sheet. */
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const setFile = useCallback(async (slot: UploadSlot, file: File) => {
    const meta = await describeFile(file);
    setSlots((prev) => ({ ...prev, [slot]: { file, meta } }));
  }, []);

  const clearFile = useCallback((slot: UploadSlot) => {
    setSlots((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }, []);

  const bothUploaded = Boolean(slots.questionPaper && slots.answerSheet);

  const startMapping = useCallback(async () => {
    if (!slots.questionPaper || !slots.answerSheet) return;

    setStage("extracting");
    setError(null);
    setErrorDetail(null);

    try {
      const data = await runExtractionPipeline(
        slots.questionPaper.file,
        slots.answerSheet.file,
      );
      setResult(data);
      setCurrentPage(data.pages[0]?.page ?? 1);
      setStage("mapping");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // The full text still reaches anyone with a console open.
      console.error("[pipeline]", raw);
      setError(friendlyError(raw));
      setErrorDetail(raw);
      // Back to upload rather than a dead loading screen. The files are
      // deliberately left in place so "Try again" is one click, not a re-upload.
      setStage("upload");
    }
  }, [slots.questionPaper, slots.answerSheet]);

  const reset = useCallback(() => {
    setStage("upload");
    setSlots({});
    setResult(null);
    setError(null);
    setErrorDetail(null);
    setActiveQuestionId(null);
    setCurrentPage(1);
  }, []);

  /** Questions joined to their mapping/grade/blocks, in paper order. */
  const questionRows = useMemo<QuestionRow[]>(() => {
    if (!result) return [];

    const mappingByQuestion = new Map(
      result.mappings
        .filter((m) => m.questionId !== null)
        .map((m) => [m.questionId as string, m]),
    );
    const gradeByQuestion = new Map(result.grades.map((g) => [g.questionId, g]));
    const blockById = new Map(result.answerBlocks.map((b) => [b.id, b]));

    return [...result.questions]
      .sort((a, b) => a.order - b.order)
      .map((question) => {
        const mapping = mappingByQuestion.get(question.id);
        return {
          question,
          mapping,
          grade: gradeByQuestion.get(question.id),
          answerBlocks: (mapping?.answerBlockIds ?? [])
            .map((id) => blockById.get(id))
            .filter((b): b is AnswerBlock => Boolean(b)),
        };
      });
  }, [result]);

  /** Answer blocks the pipeline could not attribute to any question. */
  const unmatchedBlocks = useMemo<AnswerBlock[]>(() => {
    if (!result) return [];
    const blockById = new Map(result.answerBlocks.map((b) => [b.id, b]));
    return result.mappings
      .filter((m) => m.status === "unmatched")
      .flatMap((m) => m.answerBlockIds)
      .map((id) => blockById.get(id))
      .filter((b): b is AnswerBlock => Boolean(b));
  }, [result]);

  /**
   * Selecting a question jumps the viewer to the page its answer starts on,
   * so the highlight is never off-screen.
   */
  const selectQuestion = useCallback(
    (questionId: string | null) => {
      setActiveQuestionId(questionId);
      if (!questionId) return;

      const row = questionRows.find((r) => r.question.id === questionId);
      const firstBlock = row?.answerBlocks[0];
      if (firstBlock) setCurrentPage(firstBlock.page);
    },
    [questionRows],
  );

  const totals = useMemo(() => {
    const score = questionRows.reduce((sum, r) => sum + (r.grade?.score ?? 0), 0);
    const maxScore = questionRows.reduce(
      (sum, r) => sum + (r.grade?.maxScore ?? 0),
      0,
    );
    return { score, maxScore };
  }, [questionRows]);

  return {
    // flow
    stage,
    error,
    errorDetail,
    startMapping,
    reset,

    // upload
    questionPaper: slots.questionPaper?.meta,
    answerSheet: slots.answerSheet?.meta,
    setFile,
    clearFile,
    bothUploaded,

    // mapping
    result,
    questionRows,
    unmatchedBlocks,
    totals,
    activeQuestionId,
    selectQuestion,
    currentPage,
    setCurrentPage,
  };
}
