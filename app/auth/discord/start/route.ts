import { discordAuthorizeUrl, OAUTH_STATE_COOKIE } from "@/lib/server/auth";
import { randomToken } from "@/lib/server/crypto";
import { cookieHeader, errorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const state = randomToken(32);
    return new Response(null, {
      status: 302,
      headers: {
        Location: discordAuthorizeUrl(request, state).toString(),
        "Set-Cookie": cookieHeader(OAUTH_STATE_COOKIE, state, { maxAge: 10 * 60, path: "/auth/discord" }),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
