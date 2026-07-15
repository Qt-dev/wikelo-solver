export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "request_error",
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error(error);
  return Response.json(
    { error: { code: "internal_error", message: "The request could not be completed." } },
    { status: 500 },
  );
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) {
    throw new HttpError(403, "A matching Origin header is required.", "origin_mismatch");
  }
}

export function parseCookies(request: Request) {
  const result = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    result.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
  }
  return result;
}

export function cookieHeader(
  name: string,
  value: string,
  options: { maxAge: number; path?: string },
) {
  return `${name}=${encodeURIComponent(value)}; Path=${options.path ?? "/"}; Max-Age=${options.maxAge}; Secure; HttpOnly; SameSite=Lax`;
}
