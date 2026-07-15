import { importWikeloSnapshot } from "@/lib/server/import-service";
import { verifyImportRequest } from "@/lib/server/import-security";
import { HttpError, errorResponse } from "@/lib/server/http";
import { parseNormalizedImport } from "@/lib/server/normalized-import";

export async function POST(request: Request) {
  try {
    const secret = process.env.WIKELO_IMPORT_SECRET?.trim();
    if (!secret) throw new HttpError(503, "Import signing is not configured.", "service_unconfigured");
    const body = await request.text();
    const verified = await verifyImportRequest(request, body, secret);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new HttpError(400, "Import body is not valid JSON.", "invalid_json"); }
    const result = await importWikeloSnapshot(parseNormalizedImport(parsed), verified);
    return Response.json(result, { status: result.status === "completed" ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
