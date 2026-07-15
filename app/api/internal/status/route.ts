import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gamePatches, importRuns, priceRefreshRuns } from "@/db/schema";
import { errorResponse } from "@/lib/server/http";
import { assertInternalStatusAccess } from "@/lib/server/internal-auth";

export async function GET(request: Request) {
  try {
    assertInternalStatusAccess(request);
    const db = getDb();
    const [active, previous, latestImport, latestRefresh] = await Promise.all([
      db.select().from(gamePatches).where(eq(gamePatches.activationState, "active")).limit(1),
      db.select().from(gamePatches).where(eq(gamePatches.activationState, "previous")).limit(1),
      db.select().from(importRuns).orderBy(desc(importRuns.receivedAt)).limit(1),
      db.select().from(priceRefreshRuns).orderBy(desc(priceRefreshRuns.startedAt)).limit(1),
    ]);
    return Response.json({ activePatch: active[0] ?? null, previousPatch: previous[0] ?? null, latestImport: latestImport[0] ?? null, latestPriceRefresh: latestRefresh[0] ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
