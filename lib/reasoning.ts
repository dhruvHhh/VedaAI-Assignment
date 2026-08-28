import Groq from "groq-sdk";
import {
  asArray,
  extractJson,
  isModelNotFoundError,
  isRateLimitError,
  LlmParseError,
  sleep,
} from "./llm-json";
import type { AnswerBlock, Mapping, Question } from "./types";

/**
 * Groq — the text-only reasoning provider.
 *
 * No images ever reach this module: it works purely on the strings Gemini
 * already transcribed, which is what lets the vision quota stay untouched here.
 *
 * Owns mapping outright. Grading lives in lib/grading.ts, which calls Claude
 * first and falls back to `completeJson` here on any failure.
 */

/**
 * Groq models to try, in order; the first that answers is reused.
 *
 * llama-3.3-70b-versatile is not available on this key (404
 * "does not exist or you do not have access to it") — Groq's current catalogue
 * here carries no Llama models at all. gpt-oss-120b is the strongest remaining
 * general reasoning model and supports response_format json_object.
 */
const MODEL_CHAIN = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
];

/** First model in the chain that answered; reused for the rest of the process. */
let activeModel: string | null = null;

function client(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Get one free at https://console.groq.com/keys, " +
        "add it to .env.local and restart the dev server.",
    );
  }
  return new Groq({ apiKey });
}

/**
 * One completion with the same retry policy as the vision module:
 * 429 -> one retry after 2s, unparseable JSON -> one retry.
 *
 * Note json_object mode cannot return a bare array, so every prompt asks for an
 * object wrapping one and `asArray` unwraps it.
 *
 * Exported because lib/grading.ts uses it as the fallback provider when the
 * primary grading call to Claude fails.
 */
export async function completeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  arrayKeys: string[],
): Promise<T[]> {
  const modelsToTry = activeModel ? [activeModel] : MODEL_CHAIN;
  let lastError: unknown;

  for (const modelId of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const completion = await client().chat.completions.create({
          model: modelId,
          response_format: { type: "json_object" },
          temperature: 0.2,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });

        const text = completion.choices[0]?.message?.content ?? "";
        const parsed = asArray<T>(extractJson(text), ...arrayKeys);
        activeModel = modelId;
        return parsed;
      } catch (error) {
        lastError = error;

        // A missing model is not retryable — move to the next ID.
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

  throw lastError instanceof Error ? lastError : new Error("Groq request failed");
}

/* -------------------------------------------------------------------------
 * Mapping
 * ------------------------------------------------------------------------- */

const MAPPING_SYSTEM = `You match a student's transcribed answer blocks to the questions on an exam paper. You always reply with a single JSON object.`;

function mappingPrompt(questions: Question[], answerBlocks: AnswerBlock[]): string {
  return `Match each answer block to the question it answers.

QUESTIONS (JSON):
${JSON.stringify(questions.map((q) => ({ id: q.id, text: q.text, page: q.page })))}

ANSWER BLOCKS (JSON):
${JSON.stringify(
  answerBlocks.map((b) => ({
    id: b.id,
    page: b.page,
    continuesFromPrevious: b.continuesFromPrevious ?? false,
    transcribedText: b.transcribedText,
  })),
)}

Reply with a JSON object of exactly this shape:
{ "mappings": [ { "questionId": string|null, "answerBlockIds": string[], "status": "matched"|"unanswered"|"unmatched", "confidence": number } ] }

Rules:
- EVERY question id above must appear in exactly one entry, either as
  "matched" (with one or more answerBlockIds) or "unanswered" (with an empty
  answerBlockIds array).
- EVERY answer block id above must appear in exactly one entry.
- A block that answers no question goes in an entry with "questionId": null and
  "status": "unmatched".
- If an answer spans several blocks (look at continuesFromPrevious), list all of
  those block ids under the one question, in reading order.
- "confidence" must come from this rubric. Pick the band that fits, then a
  value inside it. Do NOT default to 0.99 - that band is only for blocks that
  literally carry the question's number.
    0.95-1.00  the block explicitly writes this question's number
               (e.g. it starts "Ans 7:" or "Q11(a)")
    0.75-0.94  no number written, but the content answers this question and
               could not plausibly answer any other question on the paper
    0.40-0.74  on-topic but genuinely ambiguous: it could belong to another
               question, OR the block is rough work / partial / only loosely
               related to the question text
    0.00-0.39  little more than a positional guess
  Judge each block independently. A paper where nothing is numbered should have
  few or no values above 0.94.
  For "unanswered" and "unmatched" use 1.
- Match on meaning, not just on numbering: students often omit or mislabel
  question numbers.`;
}

export async function mapAnswers(
  questions: Question[],
  answerBlocks: AnswerBlock[],
): Promise<Mapping[]> {
  const raw = await completeJson<Record<string, unknown>>(
    MAPPING_SYSTEM,
    mappingPrompt(questions, answerBlocks),
    ["mappings", "results", "data", "items"],
  );

  const validIds = new Set(questions.map((q) => q.id));
  const validBlockIds = new Set(answerBlocks.map((b) => b.id));

  return raw.map((item) => {
    const questionId =
      typeof item.questionId === "string" && validIds.has(item.questionId)
        ? item.questionId
        : null;

    const answerBlockIds = (
      Array.isArray(item.answerBlockIds) ? item.answerBlockIds : []
    )
      .map(String)
      .filter((id) => validBlockIds.has(id));

    const status: Mapping["status"] =
      item.status === "matched" || item.status === "unmatched" || item.status === "unanswered"
        ? item.status
        : questionId === null
          ? "unmatched"
          : answerBlockIds.length > 0
            ? "matched"
            : "unanswered";

    const confidenceRaw = Number(item.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0.5;

    return { questionId, answerBlockIds, status, confidence };
  });
}
