import Anthropic from "@anthropic-ai/sdk";
import { asArray, extractJson, LlmParseError } from "./llm-json";
import { completeJson } from "./reasoning";
import type { AnswerBlock, GradeResult, Mapping, Question } from "./types";

/**
 * Grading — Groq by default; Claude first only when explicitly opted in.
 *
 * Both providers get the same prompt and the same normalisation, so a paper
 * marked by the fallback is shaped identically to one marked by Claude; only
 * the wording of the feedback differs. Whichever provider serves the call, the
 * whole paper is still marked in ONE request — batching is a property of the
 * prompt, not of the provider.
 *
 * Grading is the only step with a second provider at all. Mapping stays on Groq
 * alone (lib/reasoning.ts): it is the step whose output the UI's confidence
 * thresholds were calibrated against, and swapping models under it would
 * silently re-scale those numbers.
 *
 * See claudeEnabled() for why Claude is opt-in rather than the default.
 */

/**
 * Verified against the live Models API (GET /v1/models/claude-sonnet-5), not
 * assumed: id exact, 1M input / 128K output, adaptive thinking only —
 * `thinking: {type: "enabled"}` reports unsupported, and temperature/top_p/top_k
 * were removed on this generation and return a 400 if sent. That is why the
 * request below carries no sampling parameters, unlike the Groq call.
 */
const CLAUDE_MODEL = "claude-sonnet-5";

/**
 * Fail over quickly rather than burning the route's budget on one provider.
 *
 * The grade route allows 60s. A stalled Claude call must leave enough room for
 * Groq to still mark the paper, and Groq measures ~2-4s, so 30s is a generous
 * ceiling for the primary and still leaves ~25s of headroom.
 */
const CLAUDE_TIMEOUT_MS = 30_000;

/**
 * Whether to try Claude at all. Off unless explicitly switched on.
 *
 * The brief this was built for asks for models with a free tier. Anthropic does
 * not have an ongoing one — only a one-off trial credit — so Claude cannot be
 * the default without quietly putting the app outside that constraint. It stays
 * in the codebase because it writes better feedback and the fallback around it
 * is already tested, but reaching it now takes a deliberate decision.
 *
 * The flag is checked instead of the key on purpose. Keying off
 * ANTHROPIC_API_KEY alone would mean an operator who happens to have one in
 * their environment for something else starts spending credits here without
 * ever choosing to. An env var that says the words is unambiguous; a key
 * lying around is not.
 */
function claudeEnabled(): boolean {
  if (process.env.ENABLE_CLAUDE_GRADING !== "true") return false;

  if (!process.env.ANTHROPIC_API_KEY) {
    // Say so once, plainly, instead of letting every grading call throw and
    // recover: the operator asked for Claude and is not getting it.
    console.warn(
      "[grading] ENABLE_CLAUDE_GRADING is true but ANTHROPIC_API_KEY is not set - grading will use Groq only.",
    );
    return false;
  }

  return true;
}

function claudeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new Anthropic({
    apiKey,
    timeout: CLAUDE_TIMEOUT_MS, // milliseconds in the TS SDK
    // The point of this module is to fail over, not to keep retrying one
    // provider. The SDK's default of 2 retries would triple the worst case.
    maxRetries: 0,
  });
}

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
- Mark the answer as written. Do not give credit for content that is not there.
- Reply with the JSON object only. No prose before or after it.`;
}

/** Keys either provider might wrap the array under. */
const GRADE_ARRAY_KEYS = ["grades", "results", "data", "items"];

/**
 * One batched grading call to Claude.
 *
 * Claude does support strict structured outputs (the Models API reports
 * `structured_outputs: supported`), but this deliberately goes through the same
 * `extractJson` path as Gemini and Groq: one parser to reason about, and a
 * schema rejection here would just spend the fallback for a formatting problem
 * the fence-stripper already handles.
 */
async function gradeWithClaude(prompt: string): Promise<Record<string, unknown>[]> {
  const client = claudeClient();

  // One call, plus a single re-ask if the reply is not parseable JSON —
  // matching the Groq path. Anything else fails over immediately.
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: GRADING_SYSTEM,
      // Grading is bounded, latency-sensitive work; low effort keeps the
      // primary well inside its timeout without hurting mark quality.
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    });

    // A safety decline is a real failure — surface it so we fall back to Groq
    // rather than parsing an empty response into "no grades".
    if (message.stop_reason === "refusal") {
      throw new Error(
        `Claude declined the request (${message.stop_details?.category ?? "unspecified"})`,
      );
    }

    // content is a discriminated union; only text blocks carry the JSON.
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    try {
      return asArray<Record<string, unknown>>(extractJson(text), ...GRADE_ARRAY_KEYS);
    } catch (error) {
      if (error instanceof LlmParseError && attempt === 0) continue;
      throw error;
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new LlmParseError("Claude returned unparseable JSON twice", "");
}

/**
 * Short, log-safe description of why the primary failed.
 *
 * Includes the message, not just the class and status: a connection error
 * carries no status, so without it an outage logs as a bare "Error" and tells
 * whoever is reading the log nothing. Truncated because provider errors can
 * embed a whole response body, and never interpolates the key.
 */
function failureReason(error: unknown): string {
  const parts: string[] = [];

  // constructor.name, not .name: the SDK's error subclasses inherit a plain
  // "Error" name, so `error.name` would log every failure identically.
  if (error instanceof Error) parts.push(error.constructor.name);

  // No status here — an APIError's message already begins with it.
  const message = error instanceof Error ? error.message : String(error);
  if (message) parts.push(message.slice(0, 200));

  return parts.join(" ") || "unknown error";
}

export async function gradeAllAnswers(
  questions: Question[],
  mappings: Mapping[],
  answerBlocks: AnswerBlock[],
): Promise<GradeResult[]> {
  const matched = mappings.filter((m) => m.status === "matched" && m.questionId);

  // Nothing to mark — skip the call entirely rather than burning quota.
  let raw: Record<string, unknown>[] = [];

  if (matched.length > 0) {
    const prompt = gradingPrompt(questions, mappings, answerBlocks);

    if (!claudeEnabled()) {
      // The shipped default: Groq alone, the same model chain mapping uses.
      raw = await completeJson<Record<string, unknown>>(
        GRADING_SYSTEM,
        prompt,
        GRADE_ARRAY_KEYS,
      );
      console.log("graded via groq (claude not enabled)");
      return finalise(raw, mappings);
    }

    try {
      raw = await gradeWithClaude(prompt);
      console.log("graded via claude");
    } catch (error) {
      // Deliberately catches everything: network errors, non-2xx responses,
      // timeouts, refusals, credit exhaustion, rate limits and unparseable
      // output all mean the same thing here — Groq should mark this paper.
      console.log(`graded via groq (fallback: ${failureReason(error)})`);
      raw = await completeJson<Record<string, unknown>>(
        GRADING_SYSTEM,
        prompt,
        GRADE_ARRAY_KEYS,
      );
    }
  }

  return finalise(raw, mappings);
}

/**
 * Shared shaping for whichever provider marked the paper: clamp the model's
 * numbers, then score the questions it never saw.
 *
 * Both grading paths end here so a paper marked by Groq is shaped identically
 * to one marked by Claude — the only difference between them should be the
 * wording of the feedback.
 */
function finalise(
  raw: Record<string, unknown>[],
  mappings: Mapping[],
): GradeResult[] {
  const graded: GradeResult[] = raw
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
