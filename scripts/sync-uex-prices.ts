import { createHash, createHmac, randomUUID } from "node:crypto";
import type { UexPriceContextV1, UexPriceImportV1 } from "@/lib/contracts/api";
import { UEX_ITEMS_PRICES_URL, UEX_MARKETPLACE_PRICES_URL, assertUexPayload, fetchUexJson, parseUexItems, resolveUexMapping, selectUexPrice } from "@/lib/server/uex";

const origin = process.argv[2]?.replace(/\/$/, "");
const secret = process.env.WIKELO_IMPORT_SECRET;
if (!origin || !secret) throw new Error("WIKELO_SYNC_ORIGIN and WIKELO_IMPORT_SECRET are required.");

async function signedPost<T>(path: string, body: unknown): Promise<T> {
  const serialized = JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const requestId = randomUUID();
  const bodyHash = createHash("sha256").update(serialized).digest("hex");
  const signature = createHmac("sha256", secret).update(`${timestamp}.${requestId}.${bodyHash}`).digest("hex");
  const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-wikelo-timestamp": timestamp, "x-wikelo-request-id": requestId, "x-wikelo-signature": signature }, body: serialized });
  const text = await response.text();
  if (!response.ok) throw new Error(`Sync request failed (${response.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
}

const context = await signedPost<UexPriceContextV1>("/api/internal/prices/context", {});
if (context.schema !== "wikelo-uex-context-v1") throw new Error("Unexpected UEX context schema.");
const [terminalPayload, marketplacePayload] = await Promise.all([fetchUexJson(UEX_ITEMS_PRICES_URL), fetchUexJson(UEX_MARKETPLACE_PRICES_URL)]);
assertUexPayload(terminalPayload, "terminal prices");
assertUexPayload(marketplacePayload, "marketplace prices");
const itemById = new Map<number, ReturnType<typeof parseUexItems>[number]>();
for (const item of [...parseUexItems(terminalPayload), ...parseUexItems(marketplacePayload)]) {
  const current = itemById.get(item.idItem);
  itemById.set(item.idItem, { ...item, uuid: item.uuid ?? current?.uuid ?? null });
}
const uexItems = [...itemById.values()];
const mappings = context.candidates.map((candidate) => resolveUexMapping(candidate, uexItems));
const snapshots = new Map<string, UexPriceImportV1["snapshots"][number]>();
for (const mapping of mappings) {
  if (!mapping.uexItemId) continue;
  const selected = selectUexPrice(terminalPayload, { idItem: mapping.uexItemId, uuid: mapping.uexCommodityUuid }, marketplacePayload);
  if (selected) snapshots.set(mapping.itemId, { itemId: mapping.itemId, ...selected });
}
for (const custom of context.customListings) {
  const uexItem = itemById.get(custom.uexItemId);
  if (!uexItem) continue;
  const selected = selectUexPrice(terminalPayload, uexItem, marketplacePayload);
  if (selected) snapshots.set(custom.itemId, { itemId: custom.itemId, ...selected, source: "uex-user-match" });
}
const capturedAt = new Date().toISOString();
const revision = createHash("sha256").update(JSON.stringify([terminalPayload, marketplacePayload])).digest("hex");
const payload: UexPriceImportV1 = { schema: "wikelo-uex-import-v1", patchId: context.patchId, capturedAt, source: { itemsUrl: UEX_ITEMS_PRICES_URL, marketplaceUrl: UEX_MARKETPLACE_PRICES_URL, revision }, mappings, snapshots: [...snapshots.values()] };
const result = await signedPost<{ runId: string; itemCount: number; snapshotCount: number }>("/api/internal/prices/refresh", payload);
console.log(JSON.stringify({ runId: result.runId, itemCount: result.itemCount, snapshotCount: result.snapshotCount, revision }));
