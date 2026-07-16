import { and, asc, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { gamePatches, importRuns, itemMappings, items, priceRefreshRuns, priceSnapshots, recipeComponents, recipeOutputs, recipes, userComponentPreferences } from "@/db/schema";
import type { ComponentPreferenceStatus, RecipeComponentDto, RecipeDto, RecipesResponse } from "@/lib/contracts/api";
import { currentSession } from "@/lib/server/auth";
import { errorResponse, HttpError } from "@/lib/server/http";
import { calculateRecipeTotal } from "@/lib/server/recipe-totals";

const RECIPE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const PRICE_STALE_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const db = getDb();
    const requestedPatch = new URL(request.url).searchParams.get("patch") ?? "latest";
    const patchRows = requestedPatch === "latest"
      ? await db.select().from(gamePatches).where(eq(gamePatches.activationState, "active")).orderBy(desc(gamePatches.importedAt)).limit(1)
      : await db.select().from(gamePatches).where(and(eq(gamePatches.version, requestedPatch), ne(gamePatches.activationState, "staging"))).orderBy(desc(gamePatches.importedAt)).limit(1);
    const patch = patchRows[0];
    const processing = await db.select({ id: importRuns.id }).from(importRuns).where(eq(importRuns.status, "processing")).limit(1);
    if (!patch) {
      const empty: RecipesResponse = {
        patch: null,
        recipes: [],
        freshness: { recipesStale: true, pricesStale: true, latestPriceAt: null },
        counts: { missingMappings: 0, missingPrices: 0 },
        status: processing.length ? "importing" : "empty",
      };
      return Response.json(empty, { headers: { "Cache-Control": "private, no-store" } });
    }

    const recipeRows = await db.select().from(recipes).where(eq(recipes.patchId, patch.id)).orderBy(asc(recipes.name));
    const outputRows = await db.select().from(recipeOutputs);
    const componentRows = await db.select({
      recipeId: recipeComponents.recipeId,
      itemId: items.id,
      name: recipeComponents.componentName,
      category: recipeComponents.componentCategory,
      quantity: recipeComponents.quantity,
      sortOrder: recipeComponents.sortOrder,
      uexItemId: itemMappings.uexItemId,
      mappingStatus: itemMappings.status,
    }).from(recipeComponents)
      .innerJoin(items, eq(items.id, recipeComponents.itemId))
      .leftJoin(itemMappings, eq(itemMappings.itemId, items.id));
    const activeComponents = componentRows.filter((row) => recipeRows.some((recipe) => recipe.id === row.recipeId));
    const allPrices = await db.select({
      id: priceSnapshots.id,
      itemId: priceSnapshots.itemId,
      priceAuec: priceSnapshots.priceAuec,
      locationName: priceSnapshots.locationName,
      capturedAt: priceSnapshots.capturedAt,
      source: priceSnapshots.source,
    }).from(priceSnapshots)
      .innerJoin(priceRefreshRuns, eq(priceRefreshRuns.id, priceSnapshots.refreshRunId))
      .where(eq(priceRefreshRuns.status, "completed"))
      .orderBy(desc(priceSnapshots.capturedAt));
    const latestPrices = new Map<string, typeof allPrices[number]>();
    for (const price of allPrices) if (!latestPrices.has(price.itemId)) latestPrices.set(price.itemId, price);
    const session = await currentSession(request);
    const preferences = session
      ? await db.select().from(userComponentPreferences).where(eq(userComponentPreferences.userId, session.userId))
      : [];
    const preferenceByItem = new Map(preferences.map((preference) => [preference.itemId, preference.status]));
    const missingMappings = new Set<string>();
    const missingPrices = new Set<string>();

    const payloadRecipes: RecipeDto[] = recipeRows.map((recipe) => {
      const outputs = outputRows.filter((output) => output.recipeId === recipe.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((output) => ({ itemId: output.itemId, name: output.outputName, quantity: output.quantity }));
      const components: RecipeComponentDto[] = activeComponents
        .filter((component) => component.recipeId === recipe.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((component) => {
          const price = latestPrices.get(component.itemId);
          const preference = (preferenceByItem.get(component.itemId) ?? "needed") as ComponentPreferenceStatus;
          const mappingStatus = component.mappingStatus ?? "missing";
          if (mappingStatus !== "matched") missingMappings.add(component.itemId);
          if (preference === "needed" && !price) missingPrices.add(component.itemId);
          return {
            itemId: component.itemId,
            uexItemId: component.uexItemId,
            uexMarketplaceUrl: component.uexItemId
              ? `https://uexcorp.space/marketplace/home/?id_item=${component.uexItemId}&unit=unit&mode=list`
              : null,
            name: component.name,
            category: component.category,
            quantity: component.quantity,
            preference,
            unitPriceAuec: price?.priceAuec ?? null,
            priceSource: price?.source ?? null,
            priceLocation: price?.locationName ?? null,
            priceCapturedAt: price?.capturedAt ?? null,
            mappingStatus,
          };
        });
      return {
        id: recipe.id,
        name: recipe.name,
        category: recipe.category,
        output: { itemId: recipe.outputItemId, name: recipe.outputName, quantity: recipe.outputQuantity },
        outputs: outputs.length ? outputs : [{ itemId: recipe.outputItemId, name: recipe.outputName, quantity: recipe.outputQuantity }],
        reputationNeeded: recipe.reputationNeeded,
        reputationNeededLabel: recipe.reputationNeededLabel,
        reputationGranted: recipe.reputationGranted,
        components,
        total: calculateRecipeTotal(components),
      };
    });
    const latestPriceAt = allPrices[0]?.capturedAt ?? null;
    const now = Date.now();
    const response: RecipesResponse = {
      patch: { id: patch.id, version: patch.version, channel: patch.channel, extractedAt: patch.extractedAt, importedAt: patch.importedAt },
      recipes: payloadRecipes,
      freshness: {
        recipesStale: now - Date.parse(patch.extractedAt) > RECIPE_STALE_MS,
        pricesStale: !latestPriceAt || now - Date.parse(latestPriceAt) > PRICE_STALE_MS,
        latestPriceAt,
      },
      counts: { missingMappings: missingMappings.size, missingPrices: missingPrices.size },
      status: processing.length ? "importing" : "ready",
    };
    return Response.json(response, { headers: { "Cache-Control": session ? "private, no-store" : "public, max-age=60" } });
  } catch (error) {
    return errorResponse(error instanceof SyntaxError ? new HttpError(400, error.message) : error);
  }
}
