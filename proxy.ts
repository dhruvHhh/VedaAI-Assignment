import { NextResponse, type NextRequest } from "next/server";

/**
 * Rate limiting for the four pipeline routes.
 *
 * The repo and the deployed URL are public, and every one of those routes
 * spends free-tier quota on a third-party model. A crawler or a bored visitor
 * looping the upload endpoint could exhaust a day's budget in a couple of
 * minutes and leave the demo broken for whoever looks at it next. This is the
 * cheapest guard that makes that unlikely.
 *
 * WHAT THIS IS NOT: it is an in-memory counter inside one server instance. On
 * Vercel each serverless instance keeps its own Map, so a client spread across
 * instances gets the limit once per instance, and every counter resets on cold
 * start or redeploy. It does not survive scaling and it is not a defence
 * against a determined or distributed attacker — that needs a shared store
 * (Redis, Upstash) or an edge WAF. For a low-traffic demo whose realistic
 * threat is one script hammering one endpoint, the tradeoff is deliberate:
 * no extra service, no extra dependency, no extra key to configure.
 *
 * File name: this is `proxy.ts`, not `middleware.ts`. Next.js 16 deprecated the
 * `middleware` convention and renamed it to `proxy` (same behaviour, different
 * file and export name); `middleware.ts` still runs but warns. Verified against
 * the bundled docs for the installed version, not assumed.
 */

/** Requests allowed per IP inside the window, across all four routes. */
const LIMIT = 10;

/** Sliding window length. */
const WINDOW_MS = 10 * 60 * 1000;

/**
 * A full happy-path session is 4 calls, so 10 leaves room for a reviewer to run
 * the flow twice and still retry a failure, while stopping a loop dead.
 */
const hits = new Map<string, number[]>();

/**
 * Stop the Map growing without bound on a long-lived instance. Cheap because it
 * only runs once the map is larger than any real traffic would make it.
 */
const MAX_TRACKED_IPS = 5_000;

function sweep(now: number) {
  if (hits.size < MAX_TRACKED_IPS) return;
  for (const [ip, times] of hits) {
    if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(ip);
  }
}

/**
 * Best-effort client IP.
 *
 * `NextRequest.ip` does not exist in Next 16 — it was a Vercel-specific field
 * removed after v14, and the type has no `ip` or `geo` any more, so the pattern
 * from older tutorials would be `undefined` at runtime. The proxying layer sets
 * `x-forwarded-for` instead, whose first entry is the original client.
 *
 * Both headers are client-supplied and therefore spoofable. That is acceptable
 * here: this exists to stop accidental and lazy abuse, and someone willing to
 * rotate the header is already past what an in-memory counter can do.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function proxy(request: NextRequest) {
  const now = Date.now();
  const ip = clientIp(request);

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= LIMIT) {
    // Seconds until the oldest hit leaves the window, i.e. when one slot frees.
    const retryAfter = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - recent[0])) / 1000),
    );

    // Keep the existing timestamps: a blocked request must not extend the
    // window, or a client that keeps retrying could never recover.
    hits.set(ip, recent);

    return NextResponse.json(
      {
        error:
          "Too many requests. This demo runs on free-tier AI quota, so the pipeline routes are rate limited. Please try again shortly.",
        retryAfterSeconds: retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  recent.push(now);
  hits.set(ip, recent);
  sweep(now);

  return NextResponse.next();
}

/**
 * Only the four routes that cost money. Without a matcher this would run on
 * every request including static assets, which would both waste work and count
 * page loads against the limit.
 */
export const config = {
  matcher: [
    "/api/extract-questions",
    "/api/extract-answers",
    "/api/map-answers",
    "/api/grade",
  ],
};
