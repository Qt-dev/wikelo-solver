import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { randomToken, sha256, stableId, timingSafeEqual } from "./crypto";
import { HttpError, cookieHeader, parseCookies } from "./http";

export const SESSION_COOKIE = "wikelo_session";
export const OAUTH_STATE_COOKIE = "wikelo_discord_state";
const SESSION_SECONDS = 30 * 24 * 60 * 60;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, `${name} is not configured.`, "service_unconfigured");
  return value;
}

export function discordAuthorizeUrl(request: Request, state: string) {
  const redirectUri = new URL("/auth/discord/callback", request.url).toString();
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", requiredEnv("DISCORD_CLIENT_ID"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  return url;
}

type DiscordIdentity = { id: string; username: string; global_name?: string | null; avatar?: string | null };

export async function exchangeDiscordCode(request: Request, code: string, fetchImpl: typeof fetch = fetch) {
  const redirectUri = new URL("/auth/discord/callback", request.url).toString();
  const tokenResponse = await fetchImpl("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: requiredEnv("DISCORD_CLIENT_ID"),
      client_secret: requiredEnv("DISCORD_CLIENT_SECRET"),
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) throw new HttpError(401, "Discord rejected the authorization code.", "oauth_failed");
  const tokenPayload = (await tokenResponse.json()) as { access_token?: unknown };
  if (typeof tokenPayload.access_token !== "string") throw new HttpError(401, "Discord did not return an access token.", "oauth_failed");
  const identityResponse = await fetchImpl("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });
  // Provider tokens are intentionally kept only in this stack frame and never returned or persisted.
  if (!identityResponse.ok) throw new HttpError(401, "Discord identity lookup failed.", "oauth_failed");
  const identity = (await identityResponse.json()) as DiscordIdentity;
  if (!identity.id || !identity.username) throw new HttpError(401, "Discord identity was incomplete.", "oauth_failed");
  return identity;
}

export async function createSession(identity: DiscordIdentity) {
  const db = getDb();
  const now = new Date();
  const userId = await stableId("usr", identity.id);
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const sessionId = randomToken(18);
  const avatarUrl = identity.avatar
    ? `https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatar}.png`
    : null;
  await db.insert(users).values({
    id: userId,
    discordId: identity.id,
    displayName: identity.global_name?.trim() || identity.username,
    avatarUrl,
    updatedAt: now.toISOString(),
  }).onConflictDoUpdate({
    target: users.discordId,
    set: { displayName: identity.global_name?.trim() || identity.username, avatarUrl, updatedAt: now.toISOString() },
  });
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    tokenHash,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString(),
  });
  return { token, cookie: cookieHeader(SESSION_COOKIE, token, { maxAge: SESSION_SECONDS }) };
}

export async function currentSession(request: Request) {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const rows = await getDb()
    .select({ sessionId: sessions.id, userId: users.id, discordId: users.discordId, displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);
  return rows[0] ?? null;
}

export async function requireSession(request: Request) {
  const session = await currentSession(request);
  if (!session) throw new HttpError(401, "Authentication is required.", "authentication_required");
  return session;
}

export async function revokeSession(request: Request) {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return;
  await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
}

export function assertOauthState(request: Request, queryState: string | null) {
  const cookieState = parseCookies(request).get(OAUTH_STATE_COOKIE);
  if (!queryState || !cookieState || !timingSafeEqual(queryState, cookieState)) {
    throw new HttpError(401, "OAuth state validation failed.", "invalid_oauth_state");
  }
}
