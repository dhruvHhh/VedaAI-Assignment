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

    try {
      const data = await runExtractionPipeline(
        slots.questionPaper.file,
        slots.answerSheet.file,
      );
      setResult(data);
      setCurrentPage(data.pages[0]?.page ?? 1);
      setStage("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed.");
      setStage("upload");
    }
  }, [slots.questionPaper, slots.answerSheet]);

  const reset = useCallback(() => {
    setStage("upload");
    setSlots({});
    setResult(null);
    setError(null);
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
