import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gamePatches, itemMappings, items, priceRefreshRuns, priceSnapshots, recipeComponents, recipes } from "@/db/schema";
import type { VerifiedImport } from "./import-security";
import { stableId } from "./crypto";
import { HttpError } from "./http";
import { fetchUexJson, marketplaceListingsUrl, parseUexItems, resolveUexMapping, selectUexPrice } from "./uex";

const UEX_LISTING_FETCH_CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function refreshPrices(verified: VerifiedImport, fetchImpl: typeof fetch = fetch) {
  const db = getDb();
  const runId = await stableId("prc", verified.requestId);
  const startedAt = new Date().toISOString();
  try {
    await db.insert(priceRefreshRuns).values({ id: runId, requestId: verified.requestId, bodyHash: verified.bodyHash, status: "processing", startedAt });
  } catch (error) {
    const replay = await db.select({ id: priceRefreshRuns.id }).from(priceRefreshRuns).where(eq(priceRefreshRuns.requestId, verified.requestId)).limit(1);
    if (replay[0]) throw new HttpError(409, "This refresh request ID has already been used.", "replayed_request");
    throw error;
  }
  try {
    const pricesUrl = process.env.UEX_ITEMS_PRICES_URL?.trim();
    const marketplaceUrl = process.env.UEX_MARKETPLACE_PRICES_URL?.trim();
    if (!pricesUrl || !marketplaceUrl) throw new HttpError(503, "UEX endpoints are not configured.", "service_unconfigured");
    const [pricesPayload, marketplacePayload] = await Promise.all([
      fetchUexJson(pricesUrl, fetchImpl),
      fetchUexJson(marketplaceUrl, fetchImpl),
    ]);
    const uexItemsById = new Map<number, ReturnType<typeof parseUexItems>[number]>();
    for (const uexItem of [...parseUexItems(pricesPayload), ...parseUexItems(marketplacePayload)]) {
      const current = uexItemsById.get(uexItem.idItem);
      uexItemsById.set(uexItem.idItem, {
        ...uexItem,
        uuid: uexItem.uuid ?? current?.uuid ?? null,
      });
    }
    const uexItems = [...uexItemsById.values()];
    const candidateRows = await db.select({
      itemId: items.id,
      gameItemId: items.gameItemId,
      name: recipeComponents.componentName,
      reviewedAlias: itemMappings.reviewedAlias,
      existingUexItemId: itemMappings.uexItemId,
      existingUexUuid: itemMappings.uexCommodityUuid,
    }).from(recipeComponents)
      .innerJoin(recipes, eq(recipes.id, recipeComponents.recipeId))
      .innerJoin(gamePatches, eq(gamePatches.id, recipes.patchId))
      .innerJoin(items, eq(items.id, recipeComponents.itemId))
      .leftJoin(itemMappings, eq(itemMappings.itemId, items.id))
      .where(eq(gamePatches.activationState, "active"));
    const rows = [...new Map(candidateRows.map((row) => [row.itemId, row])).values()];
    const capturedAt = new Date().toISOString();
    const resolvedRows: Array<{ item: typeof rows[number]; mapping: ReturnType<typeof resolveUexMapping> }> = [];
    for (const item of rows) {
      const mapping = resolveUexMapping(item, uexItems);
      await db.insert(itemMappings).values({
        itemId: item.itemId,
        uexItemId: mapping.uexItemId,
        uexCommodityUuid: mapping.uexCommodityUuid,
        uexName: mapping.uexName,
        normalizedUexName: mapping.uexName?.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ") ?? null,
        status: mapping.status,
        matchMethod: mapping.matchMethod,
        reviewedAlias: item.reviewedAlias,
        updatedAt: capturedAt,
      }).onConflictDoUpdate({
        target: itemMappings.itemId,
        set: { uexItemId: mapping.uexItemId, uexCommodityUuid: mapping.uexCommodityUuid, uexName: mapping.uexName, normalizedUexName: mapping.uexName?.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ") ?? null, status: mapping.status, matchMethod: mapping.matchMethod, updatedAt: capturedAt },
      });
      if (!mapping.uexItemId) continue;
      resolvedRows.push({ item, mapping });
    }
    const pricedRows = await mapWithConcurrency(resolvedRows, UEX_LISTING_FETCH_CONCURRENCY, async ({ item, mapping }) => {
      const listingsPayload = await fetchUexJson(marketplaceListingsUrl(marketplaceUrl, mapping.uexItemId!), fetchImpl);
      return { item, mapping, selected: selectUexPrice(pricesPayload, { idItem: mapping.uexItemId!, uuid: mapping.uexCommodityUuid }, listingsPayload) };
    });
    let snapshotCount = 0;
    for (const { item, selected } of pricedRows) {
      if (!selected) continue;
      const id = await stableId("px", `${runId}:${item.itemId}:${selected.priceKind}:${selected.locationName ?? "market"}`);
      await db.insert(priceSnapshots).values({
        id,
        itemId: item.itemId,
        uexItemId: selected.uexItemId,
        uexCommodityUuid: selected.uexCommodityUuid,
        priceAuec: selected.priceAuec,
        priceKind: selected.priceKind,
        locationName: selected.locationName,
        capturedAt,
        sourceRecordId: selected.sourceRecordId,
        refreshRunId: runId,
      });
      snapshotCount += 1;
    }
    await db.update(priceRefreshRuns).set({ status: "completed", completedAt: new Date().toISOString(), itemCount: rows.length, snapshotCount }).where(eq(priceRefreshRuns.id, runId));
    return { runId, status: "completed" as const, itemCount: rows.length, snapshotCount };
  } catch (error) {
    await db.update(priceRefreshRuns).set({ status: "failed", completedAt: new Date().toISOString(), error: (error instanceof Error ? error.message : "Refresh failed").slice(0, 500) }).where(eq(priceRefreshRuns.id, runId));
    throw error;
  }
}
