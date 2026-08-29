import { mockExtractionResult } from "./mock-data";
import type {
  AnswerBlock,
  AnswerSheetPage,
  ExtractionResult,
  GradeResult,
  Mapping,
  Question,
  UploadedFile,
} from "./types";

/**
 * The one and only place that knows where data comes from.
 *
 * Set NEXT_PUBLIC_USE_MOCK_DATA=true in .env.local to run the whole flow off
 * lib/mock-data.ts with no API keys and no network calls; anything else (or
 * unset) uses the real routes. Components and hooks consume
 * runExtractionPipeline() either way, so toggling costs no code change.
 */
const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

/** How long the mocked pipeline pretends to work, in ms. */
const MOCK_LATENCY = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Surfaces the API's JSON `error` field instead of a bare status code. */
async function readError(res: Response, endpoint: string): Promise<never> {
  let detail = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body?.error) detail = body.error;
  } catch {
    // Non-JSON error body — keep the status line.
  }
  throw new Error(`${endpoint}: ${detail}`);
}

async function postFile<T>(endpoint: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);

  const res = await fetch(endpoint, { method: "POST", body });
  if (!res.ok) await readError(res, endpoint);
  return res.json() as Promise<T>;
}

async function postJson<T>(endpoint: string, payload: unknown): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readError(res, endpoint);
  return res.json() as Promise<T>;
}

/* -------------------------------------------------------------------------
 * Pipeline steps
 * ------------------------------------------------------------------------- */

interface ExtractQuestionsResponse {
  questions: Question[];
  pageImages: string[];
  model?: string | null;
}

interface ExtractAnswersResponse {
  answerBlocks: AnswerBlock[];
  pageImages: string[];
  model?: string | null;
}

/** POST /api/extract-questions — question paper in, structured questions out. */
export async function extractQuestions(
  file: File,
): Promise<ExtractQuestionsResponse> {
  if (USE_MOCK_DATA) {
    await sleep(MOCK_LATENCY / 3);
    return { questions: mockExtractionResult.questions, pageImages: [] };
  }
  return postFile<ExtractQuestionsResponse>("/api/extract-questions", file);
}

/** POST /api/extract-answers — answer sheet in, transcribed blocks + bboxes out. */
export async function extractAnswers(file: File): Promise<ExtractAnswersResponse> {
  if (USE_MOCK_DATA) {
    await sleep(MOCK_LATENCY / 3);
    return { answerBlocks: mockExtractionResult.answerBlocks, pageImages: [] };
  }
  return postFile<ExtractAnswersResponse>("/api/extract-answers", file);
}

/** POST /api/map-answers — pairs answer blocks to questions. */
export async function mapAnswers(
  questions: Question[],
  answerBlocks: AnswerBlock[],
): Promise<Mapping[]> {
  if (USE_MOCK_DATA) {
    await sleep(MOCK_LATENCY / 3);
    return mockExtractionResult.mappings;
  }
  const { mappings } = await postJson<{ mappings: Mapping[] }>(
    "/api/map-answers",
    { questions, answerBlocks },
  );
  return mappings;
}

/**
 * POST /api/grade — grades the whole paper in ONE request.
 *
 * Batched deliberately: one call per session rather than one per question keeps
 * the flow inside free-tier limits no matter how long the paper is.
 */
async function gradeAll(
  questions: Question[],
  mappings: Mapping[],
  answerBlocks: AnswerBlock[],
): Promise<GradeResult[]> {
  if (USE_MOCK_DATA) {
    await sleep(MOCK_LATENCY / 3);
    return mockExtractionResult.grades;
  }
  const { grades } = await postJson<{ grades: GradeResult[] }>("/api/grade", {
    questions,
    mappings,
    answerBlocks,
  });
  return grades;
}

/**
 * The full extract -> map -> grade sequence the loading screen waits on.
 *
 * The two extractions are independent so they run concurrently; mapping needs
 * both, and grading needs the mappings. Four API calls total per session.
 */
export async function runExtractionPipeline(
  questionPaper: File,
  answerSheet: File,
): Promise<ExtractionResult> {
  const [questionResult, answerResult] = await Promise.all([
    extractQuestions(questionPaper),
    extractAnswers(answerSheet),
  ]);

  const { questions } = questionResult;
  const { answerBlocks } = answerResult;

  const mappings = await mapAnswers(questions, answerBlocks);
  const grades = await gradeAll(questions, mappings, answerBlocks);

  return {
    questions,
    answerBlocks,
    mappings,
    grades,
    pages: buildPages(answerResult.pageImages, answerBlocks),
  };
}

/**
 * Turns the rendered answer-sheet page images into viewer pages.
 *
 * Falls back to page numbers derived from the answer blocks when there are no
 * images (mock mode), so the viewer always has something to paginate over.
 */
function buildPages(
  pageImages: string[],
  answerBlocks: AnswerBlock[],
): AnswerSheetPage[] {
  if (pageImages.length > 0) {
    return pageImages.map((imageUrl, index) => ({
      page: index + 1,
      imageUrl,
      // Rendered at 2x from US Letter; the viewer only uses this as an aspect
      // ratio, and bbox overlays are normalized so exact pixels don't matter.
      width: 1224,
      height: 1584,
    }));
  }

  if (USE_MOCK_DATA) return mockExtractionResult.pages;

  const highestPage = answerBlocks.reduce((max, b) => Math.max(max, b.page), 1);
  return Array.from({ length: highestPage }, (_, index) => ({
    page: index + 1,
    width: 1224,
    height: 1584,
  }));
}

/* -------------------------------------------------------------------------
 * File helpers — used by the upload screen.
 * ------------------------------------------------------------------------- */

const MAX_FILE_BYTES = 10 * 1024 * 1024; // "Max 10MB" in the Figma frame

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
];

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateFile(file: File): string | null {
  const isAccepted =
    ACCEPTED_MIME_TYPES.includes(file.type) ||
    /\.(pdf|png|jpe?g|webp|heic)$/i.test(file.name);

  if (!isAccepted) return "Upload a PDF or an image file.";
  if (file.size > MAX_FILE_BYTES) return "That file is over the 10MB limit.";
  return null;
}

/**
 * Page count for the uploaded file.
 *
 * Images are always one page. For PDFs we count `/Type /Page` objects in the
 * raw bytes, which is enough for a filename/size/pages summary without
 * pulling in a PDF parser. Falls back to 1 if the file can't be read.
 */
async function getPageCount(file: File): Promise<number> {
  if (!file.type.includes("pdf") && !/\.pdf$/i.test(file.name)) return 1;

  try {
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder("latin1").decode(buffer);
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    return matches?.length ?? 1;
  } catch {
    return 1;
  }
}

/** Turns a File into the summary the filled-state dropzone renders. */
export async function describeFile(file: File): Promise<UploadedFile> {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    pageCount: await getPageCount(file),
  };
}
