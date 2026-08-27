import Groq from "groq-sdk";
import {
  asArray,
  extractJson,
  isModelNotFoundError,
  isRateLimitError,
  LlmParseError,
  sleep,
} from "./llm-json";
import type { AnswerBlock, GradeResult, Mapping, Question } from "./types";

/**
 * Groq — the two text-only reasoning steps.
 *
 * No images ever reach this module: it works purely on the strings Gemini
 * already transcribed, which is what lets the vision quota stay untouched here.
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
 */
async function completeJson<T>(
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

/* -------------------------------------------------------------------------
 * Grading — one batched call for the whole paper
 * ------------------------------------------------------------------------- */

const GRADING_SYSTEM = `You are an experienced teacher marking a student's exam script. You always reply with a single JSON object.`;

function gradingPrompt(
  questions: Question[],
  mappings: Mapping[],
  answerBlocks: AnswerBlock[],
): string {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const blockById = new Map(answerBlocks.map((b) => [b.id, b]));

  // Only matched questions need marking; unanswered ones are scored 0 locally.
  const pairs = mappings
    .filter((m) => m.status === "matched" && m.questionId)
    .map((m) => ({
      questionId: m.questionId as string,
      question: questionById.get(m.questionId as string)?.text ?? "",
      answer: m.answerBlockIds
        .map((id) => blockById.get(id)?.transcribedText ?? "")
        .join(" ")
        .trim(),
    }))
    .filter((pair) => pair.question.length > 0);

  return `Mark every question below in ONE response.

QUESTION/ANSWER PAIRS (JSON):
${JSON.stringify(pairs)}

Reply with a JSON object of exactly this shape:
{ "grades": [ { "questionId": string, "score": number, "maxScore": number, "feedback": string } ] }

Rules:
- Return exactly one entry for EVERY questionId listed above — no more, no fewer.
- "maxScore" is the marks the question is worth. Infer it from what the question
  demands: a one-word recall question is 1, a short definition 2, a derivation,
  a three-point comparison or a "describe/explain" question 3, a full labelled
  diagram or multi-stage explanation 5. Use whole numbers.
- "score" is the marks earned, between 0 and maxScore. Award partial credit for
  partially correct work.
- "feedback" is 1-3 sentences addressed to the student. Say specifically what
  was right and what was missing or wrong. Be constructive and concrete; never
  just restate the score.
- Mark the answer as written. Do not give credit for content that is not there.`;
}

export async function gradeAllAnswers(
  questions: Question[],
  mappings: Mapping[],
  answerBlocks: AnswerBlock[],
): Promise<GradeResult[]> {
  const matched = mappings.filter((m) => m.status === "matched" && m.questionId);

  // Nothing to mark — skip the call entirely rather than burning quota.
  const graded: GradeResult[] =
    matched.length === 0
      ? []
      : (
          await completeJson<Record<string, unknown>>(
            GRADING_SYSTEM,
            gradingPrompt(questions, mappings, answerBlocks),
            ["grades", "results", "data", "items"],
          )
        )
          .map((item) => {
            const maxScore = Math.max(1, Math.round(Number(item.maxScore) || 1));
            const score = Math.min(
              maxScore,
              Math.max(0, Math.round(Number(item.score) || 0)),
            );
            return {
              questionId: String(item.questionId ?? ""),
              score,
              maxScore,
              feedback: String(item.feedback ?? "").trim(),
            };
          })
          .filter((g) => g.questionId.length > 0);

  // Unanswered questions never reach the model; score them here so the UI has a
  // grade for every question.
  const gradedIds = new Set(graded.map((g) => g.questionId));
  const unanswered: GradeResult[] = mappings
    .filter(
      (m) =>
        m.status === "unanswered" && m.questionId && !gradedIds.has(m.questionId),
    )
    .map((m) => ({
      questionId: m.questionId as string,
      score: 0,
      maxScore: 1,
      feedback:
        "No answer was found for this question on the answer sheet. If it was attempted elsewhere, flag it for manual review.",
    }));

  return [...graded, ...unanswered];
}
