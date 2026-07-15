import type { SessionResponse } from "@/lib/contracts/api";
import { currentSession } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const session = await currentSession(request);
    const payload: SessionResponse = {
      user: session ? { id: session.userId, discordId: session.discordId, displayName: session.displayName, avatarUrl: session.avatarUrl } : null,
    };
    return Response.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
