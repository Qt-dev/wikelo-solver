import { normalizeItemName } from "./normalized-import";

const UEX_API_ORIGINS = new Set(["https://api.uexcorp.space", "https://api.uexcorp.uk"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type JsonObject = Record<string, unknown>;

export type UexItem = { idItem: number; uuid: string | null; name: string };
export type ItemMappingCandidate = {
  itemId: string;
  gameItemId: string;
  name: string;
  reviewedAlias?: string | null;
  existingUexItemId?: number | null;
  existingUexUuid?: string | null;
};
export type ResolvedItemMapping = {
  itemId: string;
  uexItemId: number | null;
  uexCommodityUuid: string | null;
  uexName: string | null;
  status: "matched" | "review" | "missing";
  matchMethod: "exact_id" | "exact_uuid" | "reviewed_alias" | "exact_normalized_name" | null;
};
export type SelectedUexPrice = {
  uexItemId: number;
  uexCommodityUuid: string | null;
  priceAuec: number;
  priceKind: "terminal_buy" | "marketplace_listing";
  locationName: string | null;
  sourceRecordId: string | null;
};

export const MARKETPLACE_LOW_OUTLIER_RATIO = 0.5;

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

function identifier(record: JsonObject, keys: readonly string[]) {
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  }
  return null;
}

export function parseUexItems(payload: unknown): UexItem[] {
  return records(payload).flatMap((record) => {
    const idItem = integer(record, ["id_item", "item_id"]);
    const uuid = string(record, ["uuid", "item_uuid", "commodity_uuid", "id_uuid"]);
    const name = string(record, ["name", "item_name", "commodity_name", "name_commodity"]);
    return idItem !== null && idItem > 0 && name
      ? [{ idItem, uuid: uuid && UUID_PATTERN.test(uuid) ? uuid.toLowerCase() : null, name }]
      : [];
  });
}

/** Only exact UEX ID/UUID, a human-reviewed alias, or an exact normalized name can auto-match. */
export function resolveUexMapping(
  item: ItemMappingCandidate,
  uexItems: readonly UexItem[],
): ResolvedItemMapping {
  const byId = new Map(uexItems.map((uexItem) => [uexItem.idItem, uexItem]));
  const byUuid = new Map(uexItems.flatMap((uexItem) => uexItem.uuid ? [[uexItem.uuid, uexItem] as const] : []));
  const byName = new Map<string, UexItem[]>();
  for (const uexItem of uexItems) {
    const key = normalizeItemName(uexItem.name);
    byName.set(key, [...(byName.get(key) ?? []), uexItem]);
  }
  const exactId = item.existingUexItemId ? byId.get(item.existingUexItemId) : undefined;
  if (exactId) {
    return { itemId: item.itemId, uexItemId: exactId.idItem, uexCommodityUuid: exactId.uuid, uexName: exactId.name, status: "matched", matchMethod: "exact_id" };
  }
  const exactUuid = [item.existingUexUuid, item.gameItemId]
    .filter((value): value is string => Boolean(value && UUID_PATTERN.test(value)))
    .map((value) => byUuid.get(value.toLowerCase()))
    .find(Boolean);
  if (exactUuid) {
    return { itemId: item.itemId, uexItemId: exactUuid.idItem, uexCommodityUuid: exactUuid.uuid, uexName: exactUuid.name, status: "matched", matchMethod: "exact_uuid" };
  }
  if (item.reviewedAlias) {
    const aliases = byName.get(normalizeItemName(item.reviewedAlias)) ?? [];
    if (aliases.length === 1) {
      return { itemId: item.itemId, uexItemId: aliases[0].idItem, uexCommodityUuid: aliases[0].uuid, uexName: aliases[0].name, status: "matched", matchMethod: "reviewed_alias" };
    }
  }
  const names = byName.get(normalizeItemName(item.name)) ?? [];
  if (names.length === 1) {
    return { itemId: item.itemId, uexItemId: names[0].idItem, uexCommodityUuid: names[0].uuid, uexName: names[0].name, status: "matched", matchMethod: "exact_normalized_name" };
  }
  return { itemId: item.itemId, uexItemId: null, uexCommodityUuid: null, uexName: null, status: names.length > 1 ? "review" : "missing", matchMethod: null };
}

/**
 * Selects the lowest acquisition price from terminals and active per-unit seller
 * listings. Marketplace lows below half of the next listing are discarded as
 * likely outliers until the remaining lowest pair is plausible.
 */
export function selectUexPrice(
  terminalPayload: unknown,
  uexItem: Pick<UexItem, "idItem" | "uuid">,
  marketplaceListingsPayload: unknown = terminalPayload,
): SelectedUexPrice | null {
  const matching = records(terminalPayload).filter((record) =>
    integer(record, ["id_item", "item_id"]) === uexItem.idItem,
  );
  const terminal = matching.flatMap((record) => {
    const price = integer(record, ["price_buy", "buy_price"]);
    const location = string(record, ["terminal_name", "name_terminal", "location_name"]);
    const active = record.is_available !== false && record.status !== "inactive";
    return price !== null && price > 0 && location && active
      ? [{ price, location, id: identifier(record, ["id", "id_commodity_price"]) }]
      : [];
  }).sort((left, right) => left.price - right.price)[0];
  const marketplace = records(marketplaceListingsPayload).filter((record) =>
    integer(record, ["id_item", "item_id"]) === uexItem.idItem,
  );
  const listings = marketplace.flatMap((record) => {
    const operation = string(record, ["operation"]);
    const currency = string(record, ["currency"]);
    const unit = string(record, ["unit"]);
    const price = integer(record, ["price"]);
    const soldOut = record.is_sold_out === true || integer(record, ["is_sold_out"]) === 1;
    const stock = integer(record, ["in_stock"]);
    const inactive = record.status === "inactive";
    return operation?.toLowerCase() === "sell"
      && currency !== null && ["auec", "uec"].includes(currency.toLowerCase())
      && unit?.toLowerCase() === "unit"
      && price !== null && price > 0
      && !soldOut && stock !== 0 && !inactive
      ? [{ price, location: string(record, ["location"]), id: identifier(record, ["id", "id_listing"]) }]
      : [];
  }).sort((left, right) => left.price - right.price || (left.id ?? "").localeCompare(right.id ?? ""));

  let listingIndex = 0;
  while (
    listingIndex < listings.length - 1
    && listings[listingIndex].price < listings[listingIndex + 1].price * MARKETPLACE_LOW_OUTLIER_RATIO
  ) listingIndex += 1;
  const listing = listings[listingIndex];

  if (terminal && (!listing || terminal.price <= listing.price)) {
    return { uexItemId: uexItem.idItem, uexCommodityUuid: uexItem.uuid, priceAuec: terminal.price, priceKind: "terminal_buy", locationName: terminal.location, sourceRecordId: terminal.id };
  }
  return listing
    ? { uexItemId: uexItem.idItem, uexCommodityUuid: uexItem.uuid, priceAuec: listing.price, priceKind: "marketplace_listing", locationName: listing.location, sourceRecordId: listing.id }
    : null;
}

export function marketplaceListingsUrl(marketplacePricesEndpoint: string, idItem: number) {
  if (!Number.isSafeInteger(idItem) || idItem <= 0) throw new Error("UEX item ID must be a positive integer.");
  const url = new URL(marketplacePricesEndpoint);
  if (!UEX_API_ORIGINS.has(url.origin)) throw new Error("UEX endpoint must use an approved official API origin.");
  const apiVersion = url.pathname.split("/").filter(Boolean)[0] ?? "2.0";
  url.pathname = `/${apiVersion}/marketplace_listings`;
  url.search = "";
  url.searchParams.set("id_item", String(idItem));
  url.searchParams.set("operation", "sell");
  return url.toString();
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
