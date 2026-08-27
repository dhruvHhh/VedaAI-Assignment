import { NextResponse } from "next/server";
import { isRateLimitError } from "@/lib/llm-json";

/**
 * Shared error shaping for the four AI routes.
 *
 * Keeps provider errors legible in the UI's error banner instead of surfacing
 * a bare 500, and maps rate limits to 429 so the cause is obvious.
 */
export function errorResponse(route: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = isRateLimitError(error) ? 429 : 500;

  console.error(`[api/${route}]`, error);

  return NextResponse.json(
    {
      error:
        status === 429
          ? `Rate limited by the model provider on ${route}. Wait a moment and try again.`
          : message,
      route,
    },
    { status },
  );
}
