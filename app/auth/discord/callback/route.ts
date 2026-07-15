import { assertOauthState, createSession, exchangeDiscordCode, OAUTH_STATE_COOKIE } from "@/lib/server/auth";
import { cookieHeader, errorResponse, HttpError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    assertOauthState(request, url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!code) throw new HttpError(400, "Discord callback did not include a code.", "oauth_failed");
    const identity = await exchangeDiscordCode(request, code);
    const session = await createSession(identity);
    const headers = new Headers({ Location: new URL("/", request.url).toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", session.cookie);
    headers.append("Set-Cookie", cookieHeader(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/auth/discord" }));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
