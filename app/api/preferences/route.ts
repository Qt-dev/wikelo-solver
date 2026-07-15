import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items, userComponentPreferences } from "@/db/schema";
import type { ComponentPreferenceStatus } from "@/lib/contracts/api";
import { requireSession } from "@/lib/server/auth";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const preferences = await getDb().select({ itemId: userComponentPreferences.itemId, status: userComponentPreferences.status, updatedAt: userComponentPreferences.updatedAt })
      .from(userComponentPreferences).where(eq(userComponentPreferences.userId, session.userId));
    return Response.json({ preferences }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const body = await request.json() as { itemId?: unknown; status?: unknown };
    if (typeof body.itemId !== "string" || !["needed", "owned", "farmable"].includes(String(body.status))) {
      throw new HttpError(400, "itemId and a valid mutually exclusive status are required.", "invalid_preference");
    }
    const exists = await getDb().select({ id: items.id }).from(items).where(eq(items.id, body.itemId)).limit(1);
    if (!exists[0]) throw new HttpError(404, "The item does not exist.", "item_not_found");
    const status = body.status as ComponentPreferenceStatus;
    const updatedAt = new Date().toISOString();
    await getDb().insert(userComponentPreferences).values({ userId: session.userId, itemId: body.itemId, status, updatedAt })
      .onConflictDoUpdate({ target: [userComponentPreferences.userId, userComponentPreferences.itemId], set: { status, updatedAt } });
    return Response.json({ preference: { itemId: body.itemId, status, updatedAt } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
