import "server-only";

import type { ZodType } from "zod";

/** Best-effort client IP for per-IP rate limiting (behind Caddy on the VPS). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Validate a JSON body against a shared Zod schema, or return a 400/422. */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<ParseResult<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: { code: "invalid_json", message: "Request body must be valid JSON." } },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      (fields[key] ??= []).push(issue.message);
    }
    return {
      ok: false,
      response: Response.json(
        { error: { code: "validation_error", message: "Invalid input.", fields } },
        { status: 422 },
      ),
    };
  }
  return { ok: true, data: result.data };
}

export function tooManyRequests(retryAfterMs: number): Response {
  const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return Response.json(
    { error: { code: "rate_limited", message: "Too many attempts — try again later." } },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}
