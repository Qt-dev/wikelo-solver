import { HttpError, errorResponse } from "@/lib/server/http";
import { verifyImportRequest } from "@/lib/server/import-security";
import { getUexPriceContext } from "@/lib/server/price-refresh";

export async function POST(request: Request) {
  try {
    const secret = process.env.WIKELO_IMPORT_SECRET?.trim();
    if (!secret) throw new HttpError(503, "Internal request signing is not configured.", "service_unconfigured");
    const body = await request.text();
    await verifyImportRequest(request, body, secret);
    if (body.trim() !== "{}") throw new HttpError(400, "UEX context requests must have an empty object body.", "invalid_price_context");
    return Response.json(await getUexPriceContext(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
