import { NextResponse } from "next/server";
import { isRateLimitError } from "@/lib/llm-json";

/**
 * Shared error shaping for the four AI routes.
 *
 * Surfaces the provider's own message instead of a bare 500, and maps rate
 * limits to 429 so the cause is obvious. The route prefix matters: the client
 * classifies failures by it to name the step that broke (see friendlyError in
 * hooks/use-toolkit.ts), so it reads the raw text rather than showing it.
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
