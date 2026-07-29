import { and, eq, lt } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db";
import { gamePatches, itemMappings, items, priceRefreshRuns, priceSnapshots, recipeComponents, recipes, userPriceSettings } from "@/db/schema";
import type { UexPriceContextV1, UexPriceImportV1 } from "@/lib/contracts/api";
import type { VerifiedImport } from "./import-security";
import { stableId } from "./crypto";
import { HttpError } from "./http";

const MAX_ROWS = 500;
const UEX_ORIGINS = new Set(["https://api.uexcorp.space", "https://api.uexcorp.uk"]);
const METHODS = new Set(["exact_id", "exact_uuid", "reviewed_alias", "exact_normalized_name"]);
const KINDS = new Set(["terminal_buy", "marketplace_average", "marketplace_listing"]);

function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0; }
function nullableText(value: unknown): value is string | null { return value === null || text(value); }

export async function getUexPriceContext(): Promise<UexPriceContextV1> {
  const db = getDb();
  const active = await db.select({ id: gamePatches.id }).from(gamePatches).where(eq(gamePatches.activationState, "active")).limit(1);
  if (!active[0]) throw new HttpError(409, "There is no active patch to price.", "no_active_patch");
  const rows = await db.select({
    itemId: items.id, gameItemId: items.gameItemId, name: recipeComponents.componentName,
    reviewedAlias: itemMappings.reviewedAlias, existingUexItemId: itemMappings.uexItemId, existingUexUuid: itemMappings.uexCommodityUuid,
  }).from(recipeComponents).innerJoin(recipes, eq(recipes.id, recipeComponents.recipeId)).innerJoin(gamePatches, eq(gamePatches.id, recipes.patchId))
    .innerJoin(items, eq(items.id, recipeComponents.itemId)).leftJoin(itemMappings, eq(itemMappings.itemId, items.id)).where(eq(gamePatches.id, active[0].id));
  const customRows = await db.select({ itemId: userPriceSettings.itemId, uexItemId: userPriceSettings.uexItemId }).from(userPriceSettings).where(eq(userPriceSettings.mode, "listing"));
  return {
    schema: "wikelo-uex-context-v1", patchId: active[0].id,
    candidates: [...new Map(rows.map((row) => [row.itemId, { ...row, reviewedAlias: row.reviewedAlias ?? null, existingUexItemId: row.existingUexItemId ?? null, existingUexUuid: row.existingUexUuid ?? null }])).values()],
    customListings: [...new Map(customRows.filter((row): row is { itemId: string; uexItemId: number } => positive(row.uexItemId) && rows.some((candidate) => candidate.itemId === row.itemId)).map((row) => [`${row.itemId}:${row.uexItemId}`, row])).values()],
  };
}

export function parseUexPriceImport(value: unknown): UexPriceImportV1 {
  if (!object(value) || value.schema !== "wikelo-uex-import-v1" || !text(value.patchId) || !text(value.capturedAt) || Number.isNaN(Date.parse(value.capturedAt)) || !object(value.source) || !text(value.source.itemsUrl) || !text(value.source.marketplaceUrl) || !text(value.source.revision) || !Array.isArray(value.mappings) || !Array.isArray(value.snapshots) || value.mappings.length > MAX_ROWS || value.snapshots.length > MAX_ROWS) throw new HttpError(400, "UEX price import is invalid.", "invalid_price_import");
  for (const url of [value.source.itemsUrl, value.source.marketplaceUrl]) if (!UEX_ORIGINS.has(new URL(url).origin)) throw new HttpError(400, "UEX source origin is not approved.", "invalid_price_import");
  const ids = new Set<string>();
  for (const row of value.mappings) {
    if (!object(row) || !text(row.itemId) || ids.has(row.itemId) || !(row.uexItemId === null || positive(row.uexItemId)) || !nullableText(row.uexCommodityUuid) || !nullableText(row.uexName) || !["matched", "review", "missing"].includes(String(row.status)) || !(row.matchMethod === null || METHODS.has(String(row.matchMethod)))) throw new HttpError(400, "UEX mapping is invalid.", "invalid_price_import");
    ids.add(row.itemId);
  }
  for (const row of value.snapshots) if (!object(row) || !text(row.itemId) || !positive(row.uexItemId) || !positive(row.priceAuec) || !KINDS.has(String(row.priceKind)) || !nullableText(row.uexCommodityUuid) || !nullableText(row.locationName) || !nullableText(row.sourceRecordId)) throw new HttpError(400, "UEX price snapshot is invalid.", "invalid_price_import");
  return value as UexPriceImportV1;
}

export async function importUexPrices(payload: UexPriceImportV1, verified: VerifiedImport) {
  const db = getDb();
  const active = await db.select({ id: gamePatches.id }).from(gamePatches).where(eq(gamePatches.activationState, "active")).limit(1);
  if (!active[0] || active[0].id !== payload.patchId) throw new HttpError(409, "The active patch changed before the price import completed.", "stale_patch");
  const allowed = new Set((await db.select({ itemId: recipeComponents.itemId }).from(recipeComponents).innerJoin(recipes, eq(recipes.id, recipeComponents.recipeId)).where(eq(recipes.patchId, payload.patchId))).map((row) => row.itemId));
  if ([...payload.mappings, ...payload.snapshots].some((row) => !allowed.has(row.itemId))) throw new HttpError(400, "UEX import references an item outside the active patch.", "invalid_price_import");
  const prior = await db.select({ id: priceRefreshRuns.id }).from(priceRefreshRuns).where(eq(priceRefreshRuns.requestId, verified.requestId)).limit(1);
  if (prior[0]) throw new HttpError(409, "This price refresh request ID has already been used.", "replayed_request");
  const now = new Date().toISOString();
  await db.update(priceRefreshRuns).set({ status: "failed", completedAt: now, error: "stale_worker_termination" }).where(and(eq(priceRefreshRuns.status, "processing"), lt(priceRefreshRuns.startedAt, new Date(Date.now() - 15 * 60_000).toISOString())));
  const runId = await stableId("prc", verified.requestId);
  try {
    const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [db.insert(priceRefreshRuns).values({ id: runId, requestId: verified.requestId, bodyHash: verified.bodyHash, status: "completed", startedAt: now, completedAt: now, itemCount: payload.mappings.length, snapshotCount: payload.snapshots.length })];
    for (const mapping of payload.mappings) statements.push(db.insert(itemMappings).values({ ...mapping, normalizedUexName: mapping.uexName?.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ") ?? null, updatedAt: payload.capturedAt }).onConflictDoUpdate({ target: itemMappings.itemId, set: { uexItemId: mapping.uexItemId, uexCommodityUuid: mapping.uexCommodityUuid, uexName: mapping.uexName, normalizedUexName: mapping.uexName?.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ") ?? null, status: mapping.status, matchMethod: mapping.matchMethod, updatedAt: payload.capturedAt } }));
    for (const snapshot of payload.snapshots) statements.push(db.insert(priceSnapshots).values({ id: await stableId("px", `${runId}:${snapshot.itemId}:${snapshot.priceKind}:${snapshot.locationName ?? "market"}`), ...snapshot, source: snapshot.source ?? "uex", capturedAt: payload.capturedAt, refreshRunId: runId }));
    await db.batch(statements);
  } catch (error) {
    await db.insert(priceRefreshRuns).values({ id: runId, requestId: verified.requestId, bodyHash: verified.bodyHash, status: "failed", startedAt: now, completedAt: new Date().toISOString(), error: (error instanceof Error ? error.message : "Price import failed").slice(0, 500) }).onConflictDoNothing();
    throw error;
  }
  return { runId, status: "completed" as const, itemCount: payload.mappings.length, snapshotCount: payload.snapshots.length };
}
