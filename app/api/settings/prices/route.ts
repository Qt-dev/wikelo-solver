import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  gamePatches,
  itemMappings,
  items,
  priceRefreshRuns,
  priceSnapshots,
  recipeComponents,
  recipes,
  userPriceSettings,
} from "@/db/schema";
import type { PriceSettingsResponse } from "@/lib/contracts/api";
import { requireSession } from "@/lib/server/auth";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/server/http";
import { indexLatestPrices } from "@/lib/server/price-index";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const db = getDb();
    const componentRows = await db.select({
      itemId: items.id,
      name: items.name,
      category: items.category,
      uexItemId: itemMappings.uexItemId,
      uexName: itemMappings.uexName,
    }).from(recipeComponents)
      .innerJoin(recipes, eq(recipes.id, recipeComponents.recipeId))
      .innerJoin(gamePatches, eq(gamePatches.id, recipes.patchId))
      .innerJoin(items, eq(items.id, recipeComponents.itemId))
      .leftJoin(itemMappings, eq(itemMappings.itemId, items.id))
      .where(eq(gamePatches.activationState, "active"));
    const activeItems = [...new Map(componentRows.map((item) => [item.itemId, item])).values()]
      .sort((left, right) => left.name.localeCompare(right.name));
    const [settings, prices] = await Promise.all([
      db.select().from(userPriceSettings).where(eq(userPriceSettings.userId, session.userId)),
      db.select({ itemId: priceSnapshots.itemId, uexItemId: priceSnapshots.uexItemId, priceAuec: priceSnapshots.priceAuec })
        .from(priceSnapshots)
        .innerJoin(priceRefreshRuns, eq(priceRefreshRuns.id, priceSnapshots.refreshRunId))
        .where(eq(priceRefreshRuns.status, "completed"))
        .orderBy(desc(priceSnapshots.capturedAt)),
    ]);
    const settingByItem = new Map(settings.map((setting) => [setting.itemId, setting]));
    const { byItem: latestPricesByItem, byListing: latestPricesByListing } = indexLatestPrices(prices);
    const payload: PriceSettingsResponse = {
      settings: activeItems.map((item) => {
        const setting = settingByItem.get(item.itemId);
        const listingId = setting?.mode === "listing" ? setting.uexItemId : item.uexItemId;
        const price = listingId ? latestPricesByListing.get(listingId) : latestPricesByItem.get(item.itemId);
        return {
          itemId: item.itemId,
          name: item.name,
          category: item.category === "entityClass" ? "resource" : item.category,
          currentUexItemId: item.uexItemId,
          currentUexName: item.uexName,
          currentUnitPriceAuec: setting?.mode === "override" ? setting.overridePriceAuec : price?.priceAuec ?? null,
          mode: setting?.mode ?? null,
          overridePriceAuec: setting?.overridePriceAuec ?? null,
          matchedUexItemId: setting?.uexItemId ?? null,
          matchedUexName: setting?.uexName ?? null,
          updatedAt: setting?.updatedAt ?? null,
        };
      }),
    };
    return Response.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.itemId !== "string" || !["override", "listing"].includes(String(body.mode))) {
      throw new HttpError(400, "An item and correction mode are required.", "invalid_price_setting");
    }
    const mode = body.mode as "override" | "listing";
    const overridePriceAuec = mode === "override" ? Number(body.overridePriceAuec) : null;
    const uexItemId = mode === "listing" ? Number(body.uexItemId) : null;
    if (mode === "override" && (!Number.isInteger(overridePriceAuec) || Number(overridePriceAuec) < 0)) {
      throw new HttpError(400, "Override price must be a non-negative whole number.", "invalid_price_setting");
    }
    if (mode === "listing" && (!Number.isInteger(uexItemId) || Number(uexItemId) <= 0)) {
      throw new HttpError(400, "UEX listing ID must be a positive whole number.", "invalid_price_setting");
    }
    const exists = await getDb().select({ id: items.id }).from(items).where(eq(items.id, body.itemId)).limit(1);
    if (!exists[0]) throw new HttpError(404, "The item does not exist.", "item_not_found");
    const updatedAt = new Date().toISOString();
    const values = {
      userId: session.userId,
      itemId: body.itemId,
      mode,
      overridePriceAuec,
      uexItemId,
      uexName: mode === "listing" && typeof body.uexName === "string" ? body.uexName.trim().slice(0, 120) || null : null,
      updatedAt,
    };
    await getDb().insert(userPriceSettings).values(values).onConflictDoUpdate({
      target: [userPriceSettings.userId, userPriceSettings.itemId],
      set: values,
    });
    return Response.json({ setting: values }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const body = await request.json() as { itemId?: unknown };
    if (typeof body.itemId !== "string") throw new HttpError(400, "itemId is required.", "invalid_price_setting");
    await getDb().delete(userPriceSettings).where(and(eq(userPriceSettings.userId, session.userId), eq(userPriceSettings.itemId, body.itemId)));
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
