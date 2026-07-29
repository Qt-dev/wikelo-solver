import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const [url, bodyPath] = process.argv.slice(2);
const secret = process.env.WIKELO_IMPORT_SECRET;
if (!url || !bodyPath || !secret) throw new Error("URL, body path, and WIKELO_IMPORT_SECRET are required.");

const body = await readFile(bodyPath, "utf8");
const timestamp = new Date().toISOString();
const requestId = randomUUID();
const bodyHash = createHash("sha256").update(body).digest("hex");
const signature = createHmac("sha256", secret).update(`${timestamp}.${requestId}.${bodyHash}`).digest("hex");
const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-wikelo-timestamp": timestamp,
    "x-wikelo-request-id": requestId,
    "x-wikelo-signature": signature,
  },
  body,
});
const responseBody = await response.text();
if (!response.ok) throw new Error(`Sync request failed (${response.status}): ${responseBody.slice(0, 500)}`);
console.log(responseBody);
