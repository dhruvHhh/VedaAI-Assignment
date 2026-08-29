/**
 * Defensive JSON extraction and error classification, shared by all three
 * providers — Gemini (lib/vision.ts), Groq (lib/reasoning.ts) and Claude
 * (lib/grading.ts).
 *
 * Every provider is asked for strict JSON and every one of them decorates it
 * differently: Gemini wraps output in ```json fences despite responseMimeType,
 * Groq's json_object mode can only return an object so an array arrives wrapped
 * under some key, and Claude has no enforced JSON mode at all. One parser
 * absorbs all three, which is the point — three copies would drift.
 */

export class LlmParseError extends Error {
  /** The model output that could not be parsed, for logging. */
  raw: string;

  constructor(message: string, raw: string) {
    super(message);
    this.name = "LlmParseError";
    this.raw = raw;
  }
}

/** Strips markdown fences and any prose surrounding the JSON payload. */
export function extractJson(raw: string): unknown {
  const text = raw.trim();

  // Fast path: already valid.
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  // ```json ... ``` or ``` ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }

  // Last resort: slice from the first bracket to its matching last one.
  const firstArray = text.indexOf("[");
  const firstObject = text.indexOf("{");
  const candidates: [number, number][] = [];
  if (firstArray !== -1) candidates.push([firstArray, text.lastIndexOf("]")]);
  if (firstObject !== -1) candidates.push([firstObject, text.lastIndexOf("}")]);
  // Prefer whichever bracket appears first in the string.
  candidates.sort((a, b) => a[0] - b[0]);

  for (const [start, end] of candidates) {
    if (end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // try the next candidate
      }
    }
  }

  throw new LlmParseError("Could not parse JSON from model output", raw);
}

/**
 * Coerces a response into an array.
 *
 * Groq's json_object mode cannot return a bare array, so we ask for
 * `{ "mappings": [...] }` and unwrap here. Gemini usually returns the array
 * directly. Any single-key object whose value is an array is also accepted, so
 * a model renaming the key does not break the pipeline.
 */
export function asArray<T = unknown>(value: unknown, ...preferredKeys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    for (const key of preferredKeys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }

    const arrayValues = Object.values(record).filter(Array.isArray);
    if (arrayValues.length === 1) return arrayValues[0] as T[];
  }

  throw new LlmParseError(
    `Expected an array (or an object wrapping one under ${preferredKeys.join("/")})`,
    JSON.stringify(value).slice(0, 500),
  );
}

/** True for a rate-limit response from either provider. */
export function isRateLimitError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|rate.?limit|too many requests|resource_exhausted/i.test(message);
}

/**
 * True for a provider rejecting its *own* output as invalid JSON.
 *
 * Groq's `response_format: json_object` validates the completion server-side and
 * returns HTTP 400 `json_validate_failed` when the model produces something that
 * is not valid JSON. It reads like a client error — "Failed to validate JSON.
 * Please adjust your prompt." — but nothing about the request was wrong: the
 * identical body succeeds on retry. Measured at 3 failures in 8 calls on a
 * code-heavy script, each one a hard 500 for the user.
 *
 * It has to be recognised separately from LlmParseError because that only
 * covers unparseable text on a 2xx response; this failure never reaches our
 * parser at all.
 */
export function isJsonValidationError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : String(error);
  // Groq emits two wordings for the same underlying condition — "Failed to
  // validate JSON" and "Failed to generate JSON" — and matching only the first
  // left a third of the failures unretried.
  const looksLikeJsonValidation =
    /json_(?:validate|generate)_failed|failed to (?:validate|generate) json/i.test(
      message,
    );

  // Guard on the message rather than the status alone: a 400 for a genuinely
  // malformed request is not retryable and must still fail fast.
  return looksLikeJsonValidation && (status === undefined || status === 400);
}

/** True when a model ID does not exist for the caller's key. */
export function isModelNotFoundError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 404) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b404\b|not found|NOT_FOUND|is not supported|unknown model/i.test(message);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
