import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { gamePatches, importRuns, itemMappings, items, recipeComponents, recipeOutputs, recipes } from "@/db/schema";
import type { NormalizedImportV1 } from "@/lib/contracts/api";
import type { VerifiedImport } from "./import-security";
import { stableId } from "./crypto";
import { HttpError } from "./http";
import { normalizeItemName } from "./normalized-import";

export async function importWikeloSnapshot(document: NormalizedImportV1, verified: VerifiedImport) {
  const db = getDb();
  const now = new Date().toISOString();
  const runId = await stableId("imp", verified.requestId);
  try {
    await db.insert(importRuns).values({
      id: runId,
      requestId: verified.requestId,
      bodyHash: verified.bodyHash,
      sourceHash: document.patch.sourceHash.toLowerCase(),
      status: "processing",
      receivedAt: now,
    });
  } catch (error) {
    const replay = await db.select({ id: importRuns.id }).from(importRuns).where(eq(importRuns.requestId, verified.requestId)).limit(1);
    if (replay[0]) throw new HttpError(409, "This import request ID has already been used.", "replayed_request");
    throw error;
  }

  const sourceHash = document.patch.sourceHash.toLowerCase();
  const existing = await db.select({ id: gamePatches.id, state: gamePatches.activationState })
    .from(gamePatches).where(eq(gamePatches.sourceHash, sourceHash)).limit(1);
  const sameBodyImport = existing[0]
    ? await db.select({ id: importRuns.id }).from(importRuns).where(and(
      eq(importRuns.sourceHash, sourceHash),
      eq(importRuns.bodyHash, verified.bodyHash),
      ne(importRuns.id, runId),
      ne(importRuns.status, "processing"),
    )).limit(1)
    : [];
  if (existing[0] && existing[0].state !== "staging" && sameBodyImport[0]) {
    await db.update(importRuns).set({ status: "idempotent", patchId: existing[0].id, completedAt: now }).where(eq(importRuns.id, runId));
    return { runId, patchId: existing[0].id, status: "idempotent" as const };
  }

  const patchId = existing[0]?.id ?? await stableId("pat", sourceHash);
  try {
    if (existing[0]) {
      await db.delete(recipes).where(eq(recipes.patchId, patchId));
      await db.update(gamePatches).set({
        version: document.patch.version,
        build: document.patch.build,
        channel: document.patch.channel,
        extractedAt: document.patch.extractedAt,
        importedAt: now,
        activationState: "staging",
      }).where(eq(gamePatches.id, patchId));
    } else {
      await db.insert(gamePatches).values({
        id: patchId,
        version: document.patch.version,
        build: document.patch.build,
        channel: document.patch.channel,
        sourceHash,
        extractedAt: document.patch.extractedAt,
        importedAt: now,
        activationState: "staging",
      });
    }
    await db.update(importRuns).set({ patchId }).where(eq(importRuns.id, runId));

    const allItemInputs = document.recipes.flatMap((recipe) => [
      ...(recipe.outputs?.length ? recipe.outputs : [recipe.output])
        .filter((output): output is typeof output & { gameItemId: string } => Boolean(output.gameItemId))
        .map((output) => ({ gameItemId: output.gameItemId, name: output.name, category: recipe.category })),
      ...recipe.components,
    ]);
    const uniqueItems = new Map(allItemInputs.map((item) => [item.gameItemId, item]));
    const itemIds = new Map<string, string>();
    for (const item of uniqueItems.values()) {
      const itemId = await stableId("itm", item.gameItemId);
      itemIds.set(item.gameItemId, itemId);
      await db.insert(items).values({
        id: itemId,
        gameItemId: item.gameItemId,
        name: item.name,
        normalizedName: normalizeItemName(item.name),
        category: item.category,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: items.id,
        set: { name: item.name, normalizedName: normalizeItemName(item.name), category: item.category, updatedAt: now },
      });
      await db.insert(itemMappings).values({ itemId, status: "missing", updatedAt: now }).onConflictDoNothing();
    }

    for (const recipe of document.recipes) {
      const recipeId = await stableId("rcp", `${patchId}:${recipe.gameRecipeId}`);
      const outputs = recipe.outputs?.length ? recipe.outputs : [recipe.output];
      const primaryOutput = outputs[0];
      await db.insert(recipes).values({
        id: recipeId,
        patchId,
        gameRecipeId: recipe.gameRecipeId,
        name: recipe.name,
        category: recipe.category,
        outputItemId: primaryOutput.gameItemId ? itemIds.get(primaryOutput.gameItemId) ?? null : null,
        outputName: primaryOutput.name,
        outputQuantity: primaryOutput.quantity,
        reputationNeeded: recipe.reputationNeeded,
        reputationGranted: recipe.reputationGranted,
      });
      for (const [sortOrder, output] of outputs.entries()) {
        await db.insert(recipeOutputs).values({
          recipeId,
          sortOrder,
          itemId: output.gameItemId ? itemIds.get(output.gameItemId) ?? null : null,
          outputName: output.name,
          quantity: output.quantity,
          outputKind: output.kind ?? "item",
          grantTiming: output.grantTiming ?? "mission_completion",
          externalUrl: output.externalUrl ?? null,
        });
      }
      for (const [sortOrder, component] of recipe.components.entries()) {
        await db.insert(recipeComponents).values({
          recipeId,
          itemId: itemIds.get(component.gameItemId)!,
          componentName: component.name,
          componentCategory: component.category,
          quantity: component.quantity,
          sortOrder,
        });
      }
    }

    // D1 batches are atomic: only this short final batch changes visible activation state.
    await db.batch([
      db.update(gamePatches).set({ activationState: "archived" }).where(eq(gamePatches.activationState, "previous")),
      db.update(gamePatches).set({ activationState: "previous" }).where(and(eq(gamePatches.activationState, "active"), ne(gamePatches.id, patchId))),
      db.update(gamePatches).set({ activationState: "active" }).where(eq(gamePatches.id, patchId)),
      db.update(importRuns).set({ status: "completed", completedAt: new Date().toISOString() }).where(eq(importRuns.id, runId)),
    ]);
    return { runId, patchId, status: "completed" as const };
  } catch (error) {
    await db.update(importRuns).set({
      status: "failed",
      completedAt: new Date().toISOString(),
      error: (error instanceof Error ? error.message : "Import failed").slice(0, 500),
    }).where(eq(importRuns.id, runId));
    throw error;
  }
}
