import { normalizeItemName } from "./normalized-import";

const UEX_API_ORIGINS = new Set(["https://api.uexcorp.space", "https://api.uexcorp.uk"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type JsonObject = Record<string, unknown>;

export type UexCommodity = { uuid: string; name: string };
export type ItemMappingCandidate = {
  itemId: string;
  gameItemId: string;
  name: string;
  reviewedAlias?: string | null;
  existingUexUuid?: string | null;
};
export type ResolvedItemMapping = {
  itemId: string;
  uexCommodityUuid: string | null;
  uexName: string | null;
  status: "matched" | "review" | "missing";
  matchMethod: "exact_uuid" | "reviewed_alias" | "exact_normalized_name" | null;
};
export type SelectedUexPrice = {
  uexCommodityUuid: string;
  priceAuec: number;
  priceKind: "terminal_buy" | "marketplace_average";
  locationName: string | null;
  sourceRecordId: string | null;
};

function object(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(payload: unknown): JsonObject[] {
  if (Array.isArray(payload)) return payload.filter(object);
  if (!object(payload)) return [];
  if (Array.isArray(payload.data)) return payload.data.filter(object);
  return object(payload.data) && Array.isArray(payload.data.data)
    ? payload.data.data.filter(object)
    : [];
}

function string(record: JsonObject, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function integer(record: JsonObject, keys: readonly string[]) {
  for (const key of keys) {
    const raw = record[key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(value) && value >= 0) return Math.round(value);
  }
  return null;
}

export function parseUexCommodities(payload: unknown): UexCommodity[] {
  return records(payload).flatMap((record) => {
    const uuid = string(record, ["uuid", "item_uuid", "commodity_uuid", "id_uuid"]);
    const name = string(record, ["name", "item_name", "commodity_name", "name_commodity"]);
    return uuid && UUID_PATTERN.test(uuid) && name ? [{ uuid: uuid.toLowerCase(), name }] : [];
  });
}

/** Only exact UUID, a human-reviewed alias, or an exact normalized name can auto-match. */
export function resolveUexMapping(
  item: ItemMappingCandidate,
  commodities: readonly UexCommodity[],
): ResolvedItemMapping {
  const byUuid = new Map(commodities.map((commodity) => [commodity.uuid.toLowerCase(), commodity]));
  const byName = new Map<string, UexCommodity[]>();
  for (const commodity of commodities) {
    const key = normalizeItemName(commodity.name);
    byName.set(key, [...(byName.get(key) ?? []), commodity]);
  }
  const exactUuid = [item.existingUexUuid, item.gameItemId]
    .filter((value): value is string => Boolean(value && UUID_PATTERN.test(value)))
    .map((value) => byUuid.get(value.toLowerCase()))
    .find(Boolean);
  if (exactUuid) {
    return { itemId: item.itemId, uexCommodityUuid: exactUuid.uuid, uexName: exactUuid.name, status: "matched", matchMethod: "exact_uuid" };
  }
  if (item.reviewedAlias) {
    const aliases = byName.get(normalizeItemName(item.reviewedAlias)) ?? [];
    if (aliases.length === 1) {
      return { itemId: item.itemId, uexCommodityUuid: aliases[0].uuid, uexName: aliases[0].name, status: "matched", matchMethod: "reviewed_alias" };
    }
  }
  const names = byName.get(normalizeItemName(item.name)) ?? [];
  if (names.length === 1) {
    return { itemId: item.itemId, uexCommodityUuid: names[0].uuid, uexName: names[0].name, status: "matched", matchMethod: "exact_normalized_name" };
  }
  return { itemId: item.itemId, uexCommodityUuid: null, uexName: null, status: names.length > 1 ? "review" : "missing", matchMethod: null };
}

/** Selects the lowest positive terminal buy; marketplace average is fallback only. */
export function selectUexPrice(
  terminalPayload: unknown,
  commodityUuid: string,
  marketplacePayload: unknown = terminalPayload,
): SelectedUexPrice | null {
  const matching = records(terminalPayload).filter((record) =>
    string(record, ["item_uuid", "commodity_uuid", "uuid_commodity", "id_commodity_uuid"])?.toLowerCase() === commodityUuid.toLowerCase(),
  );
  const terminal = matching.flatMap((record) => {
    const price = integer(record, ["price_buy", "buy_price"]);
    const location = string(record, ["terminal_name", "name_terminal", "location_name"]);
    const active = record.is_available !== false && record.status !== "inactive";
    return price !== null && price > 0 && location && active
      ? [{ price, location, id: string(record, ["id", "id_commodity_price"]) }]
      : [];
  }).sort((left, right) => left.price - right.price)[0];
  if (terminal) {
    return { uexCommodityUuid: commodityUuid, priceAuec: terminal.price, priceKind: "terminal_buy", locationName: terminal.location, sourceRecordId: terminal.id };
  }
  const marketplace = records(marketplacePayload).filter((record) =>
    string(record, ["item_uuid", "commodity_uuid", "uuid_commodity", "id_commodity_uuid"])?.toLowerCase() === commodityUuid.toLowerCase(),
  );
  for (const record of marketplace) {
    const operation = string(record, ["operation"]);
    const currency = string(record, ["currency"]);
    const qualityTier = integer(record, ["quality_tier"]);
    if (operation && operation.toLowerCase() !== "buy") continue;
    if (currency && !["auec", "uec"].includes(currency.toLowerCase())) continue;
    if (qualityTier !== null && qualityTier !== 0) continue;
    const average = integer(record, ["price_avg", "price_buy_average", "buy_price_average", "marketplace_average"]);
    if (average !== null && average > 0) {
      return { uexCommodityUuid: commodityUuid, priceAuec: average, priceKind: "marketplace_average", locationName: null, sourceRecordId: string(record, ["id", "id_commodity_price"]) };
    }
  }
  return null;
}

export async function fetchUexJson(endpoint: string, fetchImpl: typeof fetch = fetch) {
  const url = new URL(endpoint);
  if (!UEX_API_ORIGINS.has(url.origin)) throw new Error("UEX endpoint must use an approved official API origin.");
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = process.env.UEX_API_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`UEX request failed with status ${response.status}.`);
  return response.json() as Promise<unknown>;
}
