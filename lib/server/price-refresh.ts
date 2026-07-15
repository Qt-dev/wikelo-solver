import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gamePatches, itemMappings, items, priceRefreshRuns, priceSnapshots, recipeComponents, recipes } from "@/db/schema";
import type { VerifiedImport } from "./import-security";
import { stableId } from "./crypto";
import { HttpError } from "./http";
import { fetchUexJson, parseUexCommodities, resolveUexMapping, selectUexPrice } from "./uex";

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
    const commodities = [
      ...new Map(
        [...parseUexCommodities(pricesPayload), ...parseUexCommodities(marketplacePayload)]
          .map((commodity) => [commodity.uuid, commodity]),
      ).values(),
    ];
    const candidateRows = await db.select({
      itemId: items.id,
      gameItemId: items.gameItemId,
      name: recipeComponents.componentName,
      reviewedAlias: itemMappings.reviewedAlias,
      existingUexUuid: itemMappings.uexCommodityUuid,
    }).from(recipeComponents)
      .innerJoin(recipes, eq(recipes.id, recipeComponents.recipeId))
      .innerJoin(gamePatches, eq(gamePatches.id, recipes.patchId))
      .innerJoin(items, eq(items.id, recipeComponents.itemId))
      .leftJoin(itemMappings, eq(itemMappings.itemId, items.id))
      .where(eq(gamePatches.activationState, "active"));
    const rows = [...new Map(candidateRows.map((row) => [row.itemId, row])).values()];
    let snapshotCount = 0;
    const capturedAt = new Date().toISOString();
    for (const item of rows) {
      const mapping = resolveUexMapping(item, commodities);
      await db.insert(itemMappings).values({
        itemId: item.itemId,
        uexCommodityUuid: mapping.uexCommodityUuid,
        uexName: mapping.uexName,
        normalizedUexName: mapping.uexName?.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ") ?? null,
        status: mapping.status,
        matchMethod: mapping.matchMethod,
        reviewedAlias: item.reviewedAlias,
        updatedAt: capturedAt,
      }).onConflictDoUpdate({
        target: itemMappings.itemId,
        set: { uexCommodityUuid: mapping.uexCommodityUuid, uexName: mapping.uexName, status: mapping.status, matchMethod: mapping.matchMethod, updatedAt: capturedAt },
      });
      if (!mapping.uexCommodityUuid) continue;
      const selected = selectUexPrice(pricesPayload, mapping.uexCommodityUuid, marketplacePayload);
      if (!selected) continue;
      const id = await stableId("px", `${runId}:${item.itemId}:${selected.priceKind}:${selected.locationName ?? "market"}`);
      await db.insert(priceSnapshots).values({
        id,
        itemId: item.itemId,
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
