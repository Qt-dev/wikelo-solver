import { timingSafeEqual } from "./crypto";
import { HttpError } from "./http";

export function assertInternalStatusAccess(request: Request) {
  const secret = process.env.WIKELO_INTERNAL_TOKEN?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ") || !timingSafeEqual(authorization.slice(7), secret)) {
    throw new HttpError(401, "Internal API authentication failed.", "internal_auth_failed");
  }
}
