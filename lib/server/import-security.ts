import { hmacSha256, sha256, timingSafeEqual } from "./crypto";
import { HttpError } from "./http";

export const IMPORT_WINDOW_MS = 5 * 60 * 1000;

export type VerifiedImport = {
  requestId: string;
  timestamp: string;
  bodyHash: string;
};

export async function verifyImportRequest(
  request: Request,
  body: string,
  secret: string,
  now = Date.now(),
): Promise<VerifiedImport> {
  const timestamp = request.headers.get("x-wikelo-timestamp")?.trim() ?? "";
  const requestId = request.headers.get("x-wikelo-request-id")?.trim() ?? "";
  const signature = request.headers.get("x-wikelo-signature")?.trim().toLowerCase() ?? "";
  if (!timestamp || !requestId || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new HttpError(401, "Import authentication headers are invalid.", "invalid_signature");
  }

  const timestampMs = /^\d+$/.test(timestamp) ? Number(timestamp) * 1000 : Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > IMPORT_WINDOW_MS) {
    throw new HttpError(401, "Import timestamp is outside the five-minute window.", "expired_signature");
  }

  const bodyHash = await sha256(body);
  const expected = await hmacSha256(secret, `${timestamp}.${requestId}.${bodyHash}`);
  if (!timingSafeEqual(signature, expected)) {
    throw new HttpError(401, "Import signature is invalid.", "invalid_signature");
  }
  return { requestId, timestamp, bodyHash };
}
