import { HttpError, errorResponse } from "@/lib/server/http";
import { verifyImportRequest } from "@/lib/server/import-security";
import { importUexPrices, parseUexPriceImport } from "@/lib/server/price-refresh";

export async function POST(request: Request) {
  try {
    const secret = process.env.WIKELO_IMPORT_SECRET?.trim();
    if (!secret) throw new HttpError(503, "Internal request signing is not configured.", "service_unconfigured");
    const body = await request.text();
    const verified = await verifyImportRequest(request, body, secret);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new HttpError(400, "Price import body is not valid JSON.", "invalid_json"); }
    return Response.json(await importUexPrices(parseUexPriceImport(parsed), verified), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
