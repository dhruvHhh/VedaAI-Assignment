import Groq from "groq-sdk";
import {
  asArray,
  extractJson,
  isJsonValidationError,
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
 * Models to try, strongest first. A failure moves to the next one.
 *
 * Verified against GET /v1/models on this key rather than assumed: all three
 * exist, and the catalogue carries no Llama models at all (llama-3.3-70b-versatile
 * 404s) and no qwen3-32b. gpt-oss-120b is the strongest general reasoning model
 * available and supports response_format json_object.
 *
 * The order deliberately changes model *family* at the first hop. The failure
 * this chain exists for is a model unable to emit valid JSON for a particular
 * input, which is a property of that model — so the useful second opinion comes
 * from a different lineage, not from a smaller sibling of the same one.
 */
const MODEL_CHAIN = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
];

/**
 * Preferred model, set to whichever last answered so the rest of the session
 * skips models that are unavailable on this key.
 *
 * It is a *preference*, not a pin. It used to collapse the chain to a single
 * entry, which is what made retrying pointless — see completeJson.
 */
let activeModel: string | null = null;

/** The chain to try, preferred model first, every other model still reachable. */
function orderedChain(): string[] {
  if (!activeModel) return MODEL_CHAIN;
  return [activeModel, ...MODEL_CHAIN.filter((id) => id !== activeModel)];
}

function client(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Get one free at https://console.groq.com/keys, " +
        "add it to .env.local and restart the dev server.",
    );
  }
  // maxRetries: 0 because this module does its own recovery by changing model.
  // The SDK's default of 2 would silently re-send the identical request to the
  // same model first — exactly the behaviour that proved useless — and burn the
  // route's time budget before the chain ever advanced.
  return new Groq({ apiKey, maxRetries: 0 });
}

/**
 * One completion, walking the model chain until one produces usable JSON.
 *
 * Each model gets a single attempt; a recoverable failure falls through to the
 * next model rather than re-asking the one that just failed. Anything we do not
 * recognise is rethrown immediately, since a different model will not fix a bad
 * request or a bad key.
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
  const chain = orderedChain();
  let lastError: unknown;

  for (const modelId of chain) {
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
      console.log(`served by groq (${modelId})`);
      return parsed;
    } catch (error) {
      lastError = error;

      // Every branch below moves to the NEXT model rather than re-sending an
      // identical request to the one that just failed.
      //
      // That is the whole point. The old loop retried the same model with the
      // same prompt, and a request was observed failing all three attempts that
      // way: when the model cannot produce valid JSON for a given input, asking
      // it again is not a retry, it is the same question. Failures were
      // correlated, so repetition converged on nothing.
      //
      // Changing model also helps for reasons beyond JSON: Groq's token budget
      // is per-model, so a 429 on the largest model says nothing about whether
      // a smaller one can serve the request.
      const reason = isModelNotFoundError(error)
        ? "not available on this key"
        : isRateLimitError(error)
          ? "rate limited"
          : isJsonValidationError(error)
            ? "provider rejected its own JSON"
            : error instanceof LlmParseError
              ? "unparseable JSON in response"
              : null;

      // An error we do not recognise is not something another model will fix.
      if (reason === null) throw error;

      const next = chain[chain.indexOf(modelId) + 1];
      console.log(
        `groq ${modelId} failed (${reason})` +
          (next ? ` - falling through to ${next}` : " - no models left"),
      );

      // A rate limit is the one case worth pausing on; the burst may clear.
      if (isRateLimitError(error)) await sleep(2000);
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
