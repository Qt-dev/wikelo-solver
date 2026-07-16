import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items, userComponentPreferences } from "@/db/schema";
import type { ComponentPreferenceStatus } from "@/lib/contracts/api";
import { requireSession } from "@/lib/server/auth";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const preferences = await getDb().select({ itemId: userComponentPreferences.itemId, status: userComponentPreferences.status, ownedQuantity: userComponentPreferences.ownedQuantity, farmableQuantity: userComponentPreferences.farmableQuantity, updatedAt: userComponentPreferences.updatedAt })
      .from(userComponentPreferences).where(eq(userComponentPreferences.userId, session.userId));
    return Response.json({ preferences }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const body = await request.json() as { itemId?: unknown; status?: unknown; ownedQuantity?: unknown; farmableQuantity?: unknown };
    const ownedQuantity = Number(body.ownedQuantity);
    const farmableQuantity = Number(body.farmableQuantity);
    if (typeof body.itemId !== "string" || !Number.isInteger(ownedQuantity) || ownedQuantity < 0 || !Number.isInteger(farmableQuantity) || farmableQuantity < 0) {
      throw new HttpError(400, "itemId and non-negative owned and farmable quantities are required.", "invalid_preference");
    }
    const exists = await getDb().select({ id: items.id }).from(items).where(eq(items.id, body.itemId)).limit(1);
    if (!exists[0]) throw new HttpError(404, "The item does not exist.", "item_not_found");
    const status: ComponentPreferenceStatus = ownedQuantity > 0 && farmableQuantity === 0 ? "owned" : farmableQuantity > 0 && ownedQuantity === 0 ? "farmable" : "needed";
    const updatedAt = new Date().toISOString();
    await getDb().insert(userComponentPreferences).values({ userId: session.userId, itemId: body.itemId, status, ownedQuantity, farmableQuantity, updatedAt })
      .onConflictDoUpdate({ target: [userComponentPreferences.userId, userComponentPreferences.itemId], set: { status, ownedQuantity, farmableQuantity, updatedAt } });
    return Response.json({ preference: { itemId: body.itemId, status, ownedQuantity, farmableQuantity, updatedAt } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
