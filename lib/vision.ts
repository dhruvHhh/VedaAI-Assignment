import { GoogleGenerativeAI } from "@google/generative-ai";
import { splitLabelledAnswers } from "./answer-blocks";
import { dataUrlToInlineData } from "./pdf-to-images";
import {
  asArray,
  extractJson,
  isModelNotFoundError,
  isRateLimitError,
  LlmParseError,
  sleep,
} from "./llm-json";
import type { AnswerBlock, Question } from "./types";

/**
 * Gemini — the two vision-dependent steps only.
 *
 * Everything downstream of transcription (mapping, grading) runs on Groq in
 * lib/reasoning.ts, so the tighter Gemini free-tier quota is spent purely on
 * work that genuinely needs to look at pixels.
 */

/**
 * Flash-Lite models to try, in order. The first that answers is reused for the
 * rest of the process.
 *
 * Do not "restore" the older Flash-Lite IDs: gemini-2.5-flash-lite 404s with
 * "no longer available to new users" (it still shows up in ListModels, but only
 * works for accounts that already used it) and gemini-2.0-flash-lite is retired
 * outright. Google's error text names gemini-3.5-flash-lite as the successor,
 * on the same Flash-Lite quota tier.
 */
const MODEL_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  // Alias that always resolves to the current Flash-Lite, so a future
  // retirement degrades gracefully instead of hard-failing.
  "gemini-flash-lite-latest",
];

/** Which model actually answered — surfaced by the routes for reporting. */
let activeModel: string | null = null;
export function getActiveVisionModel(): string | null {
  return activeModel;
}

function client(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local and restart the dev server.",
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

function imageParts(pageImages: string[]) {
  return pageImages.map((image) => ({ inlineData: dataUrlToInlineData(image) }));
}

/** One raw generation attempt against a specific model ID. */
async function generateOnce(
  modelId: string,
  prompt: string,
  pageImages: string[],
): Promise<string> {
  const model = client().getGenerativeModel({
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      // Transcription and block segmentation should not be a creative task.
      // At the default temperature the same 6-page script came back as
      // anywhere from 12 to 21 blocks across runs, and on some runs two
      // answers were merged into one block — which silently costs the student
      // a whole question (see docs/testing-notes.md). 0 is the lowest the API
      // accepts and makes decoding greedy.
      //
      // This reduces the variance but does not remove it: identical requests
      // can still differ, so it is paired with the deterministic repair in
      // lib/answer-blocks.ts rather than relied on alone.
      temperature: 0,
    },
  });

  const result = await model.generateContent([prompt, ...imageParts(pageImages)]);
  return result.response.text();
}

/**
 * Runs a prompt with the retry policy the app needs and nothing more:
 *   - primary model 404 -> switch to the fallback permanently
 *   - 429              -> one retry after 2s
 *   - unparseable JSON -> one retry
 *
 * Call volume here is a handful of requests per session, so a single retry
 * covers realistic transient failures without a backoff queue.
 */
async function generateJson<T>(
  prompt: string,
  pageImages: string[],
  arrayKeys: string[],
): Promise<T[]> {
  const modelsToTry = activeModel ? [activeModel] : MODEL_CHAIN;

  let lastError: unknown;

  for (const modelId of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await generateOnce(modelId, prompt, pageImages);
        activeModel = modelId;
        return asArray<T>(extractJson(text), ...arrayKeys);
      } catch (error) {
        lastError = error;

        // A missing model is not retryable — move to the fallback ID.
        if (isModelNotFoundError(error)) break;

        if (isRateLimitError(error) && attempt === 0) {
          await sleep(2000);
          continue;
        }
        if (error instanceof LlmParseError && attempt === 0) {
          continue;
        }
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini request failed");
}

/* -------------------------------------------------------------------------
 * Question paper
 * ------------------------------------------------------------------------- */

const QUESTIONS_PROMPT = `You are reading the pages of a printed exam question paper.

Return ONLY a JSON array. Each element must be:
{
  "id": string,     // the exact printed label, e.g. "1", "7", "11(a)"
  "text": string,   // the full question text, transcribed verbatim
  "page": number,   // 1-based index of the page image the question appears on
  "order": number   // 1-based sequence across the whole paper, in printed order
}

Rules:
- Treat labelled sub-parts as SEPARATE entries: "11(a)" and "11(b)" are two
  questions, never one combined entry.
- Preserve the exact printed numbering in "id". Do not renumber, normalise or
  invent labels. If a question is printed as "Q.7." the id is "7".
- Keep the questions in printed order and make "order" strictly increasing
  starting at 1.
- "text" is the question only. Exclude mark allocations like "[3 marks]",
  section headings, instructions and page furniture.
- If a question's text continues onto the next page, join it into one entry and
  use the page where it starts.
- Ignore anything that is not a question (title blocks, "Answer all questions",
  page numbers).`;

export async function extractQuestions(pageImages: string[]): Promise<Question[]> {
  const raw = await generateJson<Record<string, unknown>>(
    QUESTIONS_PROMPT,
    pageImages,
    ["questions", "items", "data"],
  );

  return raw
    .map((item, index) => ({
      id: String(item.id ?? index + 1),
      text: String(item.text ?? "").trim(),
      page: Number(item.page) || 1,
      order: Number(item.order) || index + 1,
    }))
    .filter((q) => q.text.length > 0)
    .sort((a, b) => a.order - b.order);
}

/* -------------------------------------------------------------------------
 * Answer sheet
 * ------------------------------------------------------------------------- */

const ANSWERS_PROMPT = `You are reading the pages of a student's HANDWRITTEN answer sheet.

Return ONLY a JSON array. Each element must be:
{
  "id": string,                // stable unique id, e.g. "ab-1", "ab-2"
  "transcribedText": string,   // the handwriting transcribed as faithfully as possible
  "page": number,              // 1-based index of the page image
  "bbox": [ymin, xmin, ymax, xmax],   // normalized 0-1000, see below
  "continuesFromPrevious": boolean    // true if this block continues the previous block
}

Segmentation:
- Split the handwriting into distinct answer blocks. One block = one contiguous
  answer (or the part of an answer that sits on this page).
- When an answer runs over a page break, emit a separate block on the next page
  with "continuesFromPrevious": true.
- Include rough work and stray notes as their own blocks; do not merge them into
  a real answer.

Bounding boxes — this matters, be precise:
- "bbox" must be a FLAT array of exactly four integers: [ymin, xmin, ymax, xmax].
  Do NOT nest it, and do not return a list of boxes — one box per block.
  Correct:   "bbox": [77, 101, 95, 579]
  Incorrect: "bbox": [[77, 101, 95, 579]]
- Each value is an integer from 0 to 1000, normalized against the FULL page
  image: y is measured from the TOP edge, x from the LEFT edge.
- ymin < ymax and xmin < xmax always.
- Draw the box tightly around the handwritten strokes of that block only.
  Exclude printed rules/margins, the page border, whitespace above and below,
  and any neighbouring block's writing.
- Do not return a whole-page box like [0, 0, 1000, 1000].

Transcription:
- Transcribe what is actually written, including mistakes. Do not correct or
  improve the student's answer.
- For a diagram, describe it briefly in square brackets, e.g.
  "[Diagram] labelled sketch of the human heart".
- If a word is illegible, use "[illegible]".`;

export async function extractAnswers(pageImages: string[]): Promise<AnswerBlock[]> {
  const raw = await generateJson<Record<string, unknown>>(
    ANSWERS_PROMPT,
    pageImages,
    ["answerBlocks", "answers", "blocks", "items", "data"],
  );

  const blocks = raw
    .map((item, index) => ({
      id: String(item.id ?? `ab-${index + 1}`),
      transcribedText: String(item.transcribedText ?? "").trim(),
      page: Number(item.page) || 1,
      bbox: normalizeBbox(item.bbox),
      continuesFromPrevious: Boolean(item.continuesFromPrevious),
    }))
    .filter((block) => block.transcribedText.length > 0);

  // Repair merged answers before anything downstream sees them. Mapping reads a
  // block by what it opens with, so a block holding the tail of A7 followed by
  // the whole of A8 is attributed to Q7 and Q8 is reported unanswered.
  const split = splitLabelledAnswers(blocks);
  if (split.length !== blocks.length) {
    console.log(
      `[extract-answers] split ${split.length - blocks.length} merged answer block(s): ${blocks.length} -> ${split.length}`,
    );
  }
  return split;
}

/**
 * Clamps a model-supplied bbox into the contract's shape.
 *
 * Vision models occasionally emit [xmin, ymin, xmax, ymax] or an inverted pair
 * despite the prompt, which would render an invisible or inside-out overlay, so
 * min/max are sorted rather than trusted.
 */
function normalizeBbox(value: unknown): AnswerBlock["bbox"] {
  // Gemini reliably returns bbox nested one level — [[ymin,xmin,ymax,xmax]] —
  // despite the prompt asking for a flat array. Unwrap it; when several boxes
  // come back for one block, merge them into the enclosing box.
  let candidate: unknown = value;
  if (Array.isArray(candidate) && candidate.every((v) => Array.isArray(v))) {
    const boxes = (candidate as unknown[][]).filter((b) => b.length === 4);
    if (boxes.length > 0) {
      candidate =
        boxes.length === 1
          ? boxes[0]
          : [
              Math.min(...boxes.map((b) => Number(b[0]))),
              Math.min(...boxes.map((b) => Number(b[1]))),
              Math.max(...boxes.map((b) => Number(b[2]))),
              Math.max(...boxes.map((b) => Number(b[3]))),
            ];
    }
  }

  const nums = Array.isArray(candidate) ? candidate.map(Number) : [];
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
    // Nothing usable — a thin strip beats an invisible or full-page box.
    return [0, 0, 40, 1000];
  }

  const clamp = (n: number) => Math.min(1000, Math.max(0, Math.round(n)));
  const [a, b, c, d] = nums.map(clamp);

  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}
