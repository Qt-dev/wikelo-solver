import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScript } from "./ts-module-loader.mjs";

const cryptoModule = await importTypeScript("lib/server/crypto.ts");
const security = await importTypeScript("lib/server/import-security.ts");
const http = await importTypeScript("lib/server/http.ts");

test("signed imports cover timestamp, request id, and the exact body hash", async () => {
  const now = Date.parse("2026-07-15T12:00:00.000Z");
  const timestamp = String(now / 1000);
  const requestId = "request-123";
  const body = '{"schema":"wikelo-normalized-v1"}';
  const bodyHash = await cryptoModule.sha256(body);
  const signature = await cryptoModule.hmacSha256("test-secret", `${timestamp}.${requestId}.${bodyHash}`);
  const request = new Request("https://wikelo.test/api/internal/imports/wikelo", {
    method: "POST",
    headers: { "x-wikelo-timestamp": timestamp, "x-wikelo-request-id": requestId, "x-wikelo-signature": signature },
  });
  assert.deepEqual(await security.verifyImportRequest(request, body, "test-secret", now), { requestId, timestamp, bodyHash });
  await assert.rejects(() => security.verifyImportRequest(request, `${body} `, "test-secret", now), /signature is invalid/i);
});

test("signed imports reject timestamps outside five minutes", async () => {
  const timestamp = "1000";
  const body = "{}";
  const requestId = "stale";
  const signature = await cryptoModule.hmacSha256("secret", `${timestamp}.${requestId}.${await cryptoModule.sha256(body)}`);
  const request = new Request("https://wikelo.test/import", { headers: { "x-wikelo-timestamp": timestamp, "x-wikelo-request-id": requestId, "x-wikelo-signature": signature } });
  await assert.rejects(() => security.verifyImportRequest(request, body, "secret", 1_301_000), /five-minute window/i);
});

test("same-origin writes require an exact Origin match", () => {
  assert.doesNotThrow(() => http.assertSameOrigin(new Request("https://wikelo.test/api/preferences", { headers: { Origin: "https://wikelo.test" } })));
  assert.throws(() => http.assertSameOrigin(new Request("https://wikelo.test/api/preferences", { headers: { Origin: "https://evil.test" } })), /matching Origin/i);
});
