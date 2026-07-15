import { revokeSession, SESSION_COOKIE } from "@/lib/server/auth";
import { assertSameOrigin, cookieHeader, errorResponse } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await revokeSession(request);
    return new Response(null, {
      status: 204,
      headers: { "Set-Cookie": cookieHeader(SESSION_COOKIE, "", { maxAge: 0 }) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
