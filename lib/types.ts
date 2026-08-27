/**
 * Backend contract.
 *
 * These four interfaces mirror exactly what the real API will return — field
 * names and shapes must not drift, since /api/extract-questions,
 * /api/extract-answers and /api/map-answers will populate them verbatim.
 */

export interface Question {
  id: string; // e.g. "11(a)"
  text: string;
  page: number;
  order: number;
}

export interface AnswerBlock {
  id: string;
  transcribedText: string;
  page: number;
  /** [ymin, xmin, ymax, xmax], normalized 0-1000 */
  bbox: [number, number, number, number];
  continuesFromPrevious?: boolean;
}

export type MappingStatus = "matched" | "unanswered" | "unmatched";

export interface Mapping {
  /** null when an answer block could not be attributed to any question. */
  questionId: string | null;
  answerBlockIds: string[];
  status: MappingStatus;
  confidence: number;
}

export interface GradeResult {
  questionId: string;
  score: number;
  maxScore: number;
  feedback: string;
}

/* -------------------------------------------------------------------------
 * UI-side types. These are presentation concerns, not part of the backend
 * contract above, and are free to evolve independently.
 * ------------------------------------------------------------------------- */

/** A file the teacher has attached to one of the two dropzones. */
export interface UploadedFile {
  name: string;
  /** Bytes. Rendered as KB/MB by formatFileSize(). */
  size: number;
  type: string;
  /** Page count — for PDFs from the doc itself, for images always 1. */
  pageCount: number;
}

export type UploadSlot = "questionPaper" | "answerSheet";

/** One rendered page of the scanned answer sheet. */
export interface AnswerSheetPage {
  page: number;
  /**
   * Scan URL. Optional while there is no backend: when absent the viewer
   * renders a stand-in ruled page from the page's answer blocks, so bbox
   * highlights still land on visible text.
   */
  imageUrl?: string;
  width: number;
  height: number;
}

/** Which screen the flow is currently on. */
export type FlowStage = "upload" | "extracting" | "mapping";

/**
 * Everything the mapping screen needs, as returned by the extraction +
 * mapping pipeline. One object so swapping mocks for fetch() is a single
 * change in lib/api.ts.
 */
export interface ExtractionResult {
  questions: Question[];
  answerBlocks: AnswerBlock[];
  mappings: Mapping[];
  grades: GradeResult[];
  pages: AnswerSheetPage[];
}
