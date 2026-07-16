import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gamePatches, recipes, userRecipeTodos } from "@/db/schema";
import type { RecipeTodosResponse } from "@/lib/contracts/api";
import { requireSession } from "@/lib/server/auth";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const todos = await getDb().select({
      recipeId: userRecipeTodos.recipeId,
      quantity: userRecipeTodos.quantity,
      updatedAt: userRecipeTodos.updatedAt,
    }).from(userRecipeTodos)
      .innerJoin(recipes, eq(recipes.id, userRecipeTodos.recipeId))
      .innerJoin(gamePatches, eq(gamePatches.id, recipes.patchId))
      .where(and(eq(userRecipeTodos.userId, session.userId), eq(gamePatches.activationState, "active")));
    const response: RecipeTodosResponse = { todos };
    return Response.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const body = await request.json() as { recipeId?: unknown; quantity?: unknown };
    const quantity = Number(body.quantity);
    if (typeof body.recipeId !== "string" || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new HttpError(400, "recipeId and a quantity from 1 to 99 are required.", "invalid_recipe_todo");
    }
    const recipe = await getDb().select({ id: recipes.id }).from(recipes)
      .innerJoin(gamePatches, eq(gamePatches.id, recipes.patchId))
      .where(and(eq(recipes.id, body.recipeId), eq(gamePatches.activationState, "active")))
      .limit(1);
    if (!recipe[0]) throw new HttpError(404, "The active recipe does not exist.", "recipe_not_found");
    const updatedAt = new Date().toISOString();
    await getDb().insert(userRecipeTodos).values({ userId: session.userId, recipeId: body.recipeId, quantity, updatedAt })
      .onConflictDoUpdate({ target: [userRecipeTodos.userId, userRecipeTodos.recipeId], set: { quantity, updatedAt } });
    return Response.json({ todo: { recipeId: body.recipeId, quantity, updatedAt } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const body = await request.json() as { recipeId?: unknown };
    if (typeof body.recipeId !== "string") throw new HttpError(400, "recipeId is required.", "invalid_recipe_todo");
    await getDb().delete(userRecipeTodos).where(and(eq(userRecipeTodos.userId, session.userId), eq(userRecipeTodos.recipeId, body.recipeId)));
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
