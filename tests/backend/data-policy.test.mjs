import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScript } from "./ts-module-loader.mjs";

const normalized = await importTypeScript("lib/server/normalized-import.ts");
const uex = await importTypeScript("lib/server/uex.ts");
const totals = await importTypeScript("lib/server/recipe-totals.ts");
const priceIndex = await importTypeScript("lib/server/price-index.ts");

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("normalized imports require complete recipes and positive quantities", () => {
  const valid = {
    schema: "wikelo-normalized-v1",
    patch: { version: "4.2", build: "123", channel: "LIVE", sourceHash: "a".repeat(64), extractedAt: "2026-07-15T00:00:00Z" },
    recipes: [{ gameRecipeId: "r1", name: "Recipe", category: "armor", output: { gameItemId: null, name: "Output", quantity: 1 }, outputs: [{ gameItemId: null, name: "Output", quantity: 1 }], reputationNeeded: 0, reputationNeededLabel: null, reputationGranted: 5, components: [{ gameItemId: "i1", name: "Iron", category: "material", quantity: 2 }] }],
  };
  assert.equal(normalized.parseNormalizedImport(valid), valid);
  assert.deepEqual(valid.recipes[0].outputs, [valid.recipes[0].output]);
  assert.throws(() => normalized.parseNormalizedImport({ ...valid, recipes: [{ ...valid.recipes[0], components: [] }] }), /invalid or incomplete/i);
});

test("normalized imports retain every produced item", () => {
  const payload = {
    schema: "wikelo-normalized-v1",
    patch: { version: "4.2", build: "123", channel: "LIVE", sourceHash: "c".repeat(64), extractedAt: "2026-07-15T00:00:00Z" },
    recipes: [{ gameRecipeId: "r3", name: "Bundle", category: "armor", output: { gameItemId: "reward-1", name: "Helmet", quantity: 1 }, outputs: [{ gameItemId: "reward-1", name: "Helmet", quantity: 1 }, { gameItemId: "reward-2", name: "Wikelo Favor", quantity: 20 }], reputationNeeded: 0, reputationGranted: 5, components: [{ gameItemId: "i3", name: "Iron", category: "material", quantity: 2 }] }],
  };
  const parsed = normalized.parseNormalizedImport(payload);
  assert.equal(parsed.recipes[0].outputs.length, 2);
  assert.equal(parsed.recipes[0].outputs[1].name, "Wikelo Favor");
});

test("normalized imports retain mission-start blueprint metadata", () => {
  const blueprint = { gameItemId: "bp-1", name: "Metamaterial Blueprint", quantity: 1, kind: "blueprint", grantTiming: "mission_start", externalUrl: "https://scmdb.net/?page=fab&fab=BP_CRAFT_Carryable_2H_CY_CollectorMaterial_001" };
  const payload = {
    schema: "wikelo-normalized-v1",
    patch: { version: "4.2", build: "123", channel: "LIVE", sourceHash: "d".repeat(64), extractedAt: "2026-07-15T00:00:00Z" },
    recipes: [{ gameRecipeId: "r4", name: "Metamaterial Test", category: "resource", output: blueprint, outputs: [blueprint], reputationNeeded: 0, reputationGranted: 0, components: [{ gameItemId: "i4", name: "Material", category: "resource", quantity: 1 }] }],
  };
  const parsed = normalized.parseNormalizedImport(payload);
  assert.equal(parsed.recipes[0].outputs[0].grantTiming, "mission_start");
  assert.match(parsed.recipes[0].outputs[0].externalUrl, /BP_CRAFT_Carryable_2H_CY_CollectorMaterial_001$/);
});

test("UEX mapping permits exact ID, exact UUID, reviewed alias, and unique normalized name only", () => {
  const uexItems = [{ idItem: 10, uuid: UUID_A, name: "Golden Medmon" }, { idItem: 11, uuid: UUID_B, name: "Copper" }];
  assert.equal(uex.resolveUexMapping({ itemId: "0", gameItemId: "game-id", name: "wrong", existingUexItemId: 11 }, uexItems).matchMethod, "exact_id");
  assert.equal(uex.resolveUexMapping({ itemId: "1", gameItemId: UUID_A, name: "wrong" }, uexItems).matchMethod, "exact_uuid");
  assert.equal(uex.resolveUexMapping({ itemId: "2", gameItemId: "game-copper", name: "wrong", reviewedAlias: " Copper " }, uexItems).matchMethod, "reviewed_alias");
  assert.equal(uex.resolveUexMapping({ itemId: "3", gameItemId: "game-medmon", name: "GOLDEN   MEDMON" }, uexItems).matchMethod, "exact_normalized_name");
  assert.equal(uex.resolveUexMapping({ itemId: "4", gameItemId: "game-fuzzy", name: "Golden Medmo" }, uexItems).status, "missing");
});

test("Wikelo Favor matches by id_item even when UEX has no game UUID", () => {
  const payload = { data: [{ id_item: 4385, item_uuid: null, item_name: "Wikelo Favor", operation: "buy", currency: "UEC", quality_tier: 0, price_avg: 250000, id: "wif" }] };
  assert.deepEqual(uex.parseUexItems(payload), [{ idItem: 4385, uuid: null, name: "Wikelo Favor" }]);
  const mapping = uex.resolveUexMapping({ itemId: "favor", gameItemId: "game-favor", name: "Wikelo Favor" }, uex.parseUexItems(payload));
  assert.equal(mapping.uexItemId, 4385);
  assert.equal(mapping.matchMethod, "exact_normalized_name");
  const listings = { data: [{ id_item: 4385, operation: "sell", currency: "UEC", unit: "unit", price: 250000, in_stock: 1, id: 99 }] };
  assert.deepEqual(uex.selectUexPrice({ data: [] }, { idItem: 4385, uuid: null }, listings), {
    uexItemId: 4385,
    uexCommodityUuid: null,
    priceAuec: 250000,
    priceKind: "marketplace_listing",
    locationName: null,
    sourceRecordId: "99",
  });
});

test("lowest valid acquisition price wins across terminals and marketplace listings", () => {
  const prices = { data: [
    { id_item: 10, item_uuid: UUID_A, item_name: "Golden Medmon", terminal_name: "High", price_buy: 120, id: "1" },
    { id_item: 10, item_uuid: UUID_A, item_name: "Golden Medmon", terminal_name: "Low", price_buy: 80, id: "2" },
  ] };
  const marketplace = { data: [
    { id_item: 11, operation: "sell", currency: "AUEC", unit: "pack", price: 12, in_stock: 1, id: "pack" },
    { id_item: 11, operation: "buy", currency: "AUEC", unit: "unit", price: 20, in_stock: 1, id: "bid" },
    { id_item: 11, operation: "sell", currency: "AUEC", unit: "unit", price: 47, in_stock: 1, id: 3, location: "Area18" },
    { id_item: 11, operation: "sell", currency: "AUEC", unit: "unit", price: 50, in_stock: 2, id: 4 },
  ] };
  assert.deepEqual(uex.selectUexPrice(prices, { idItem: 10, uuid: UUID_A }, marketplace), { uexItemId: 10, uexCommodityUuid: UUID_A, priceAuec: 80, priceKind: "terminal_buy", locationName: "Low", sourceRecordId: "2" });
  assert.deepEqual(uex.selectUexPrice(prices, { idItem: 11, uuid: UUID_B }, marketplace), { uexItemId: 11, uexCommodityUuid: UUID_B, priceAuec: 47, priceKind: "marketplace_listing", locationName: "Area18", sourceRecordId: "3" });
  assert.equal(uex.selectUexPrice(prices, { idItem: 12, uuid: null }, marketplace), null);
  assert.deepEqual(uex.parseUexItems(prices), [{ idItem: 10, uuid: UUID_A, name: "Golden Medmon" }, { idItem: 10, uuid: UUID_A, name: "Golden Medmon" }]);
});

test("an outrageously low marketplace listing is skipped unless another listing corroborates it", () => {
  const listing = (id, price) => ({ id, id_item: 4741, operation: "sell", currency: "UEC", unit: "unit", price, in_stock: 1 });
  const outlier = uex.selectUexPrice({ data: [] }, { idItem: 4741, uuid: null }, { data: [listing(1, 100), listing(2, 1000), listing(3, 1100)] });
  assert.equal(outlier.priceAuec, 1000);
  const corroborated = uex.selectUexPrice({ data: [] }, { idItem: 4741, uuid: null }, { data: [listing(1, 100), listing(2, 100), listing(3, 1000)] });
  assert.equal(corroborated.priceAuec, 100);
});

test("current quality-zero marketplace averages reconcile from the all-items payload", () => {
  const averages = { data: [
    { id: 1, id_item: 4741, quality_tier: 0, operation: "sell", currency: "UEC", unit: "pack", listings_count: 1, price_avg: 10 },
    { id: 2, id_item: 4741, quality_tier: 2, operation: "sell", currency: "UEC", unit: "unit", listings_count: 13, price_avg: 190308 },
    { id: 3, id_item: 4741, quality_tier: 0, operation: "sell", currency: "UEC", unit: "unit", listings_count: 13, price_avg: 1236923 },
  ] };
  assert.deepEqual(uex.selectUexPrice({ data: [] }, { idItem: 4741, uuid: null }, averages), {
    uexItemId: 4741,
    uexCommodityUuid: null,
    priceAuec: 1236923,
    priceKind: "marketplace_average",
    locationName: null,
    sourceRecordId: "3",
  });
});

test("marketplace listing URLs request all active sale listings for one item", () => {
  assert.equal(uex.marketplaceListingsUrl("https://api.uexcorp.uk/2.0/marketplace_prices_averages_all", 4741), "https://api.uexcorp.uk/2.0/marketplace_listings?id_item=4741&operation=sell");
});

test("owned and farmable components cost zero while needed missing prices stay incomplete", () => {
  const result = totals.calculateRecipeTotal([
    { itemId: "needed-priced", quantity: 2, preference: "needed", unitPriceAuec: 10 },
    { itemId: "owned-missing", quantity: 1, preference: "owned", unitPriceAuec: null },
    { itemId: "needed-missing", quantity: 1, preference: "needed", unitPriceAuec: null },
  ]);
  assert.deepEqual(result, { valueAuec: 20, complete: false, missingItemIds: ["needed-missing"] });
});

test("partial allocations price only the units that remain needed", () => {
  const result = totals.calculateRecipeTotal([
    { itemId: "favor", quantity: 12, preference: "needed", allocation: { ownedQuantity: 5, farmableQuantity: 4 }, unitPriceAuec: 250000 },
  ]);
  assert.deepEqual(result, { valueAuec: 750000, complete: true, missingItemIds: [] });
});

test("a saved UEX listing reuses its newest price across item mappings", () => {
  const oldForListing = { itemId: "old-item", uexItemId: 4385, priceAuec: 250000 };
  const unrelatedItemFallback = { itemId: "target-item", uexItemId: 12, priceAuec: 99 };
  const indexed = priceIndex.indexLatestPrices([oldForListing, unrelatedItemFallback]);
  assert.equal(indexed.byListing.get(4385), oldForListing);
  assert.equal(indexed.byItem.get("target-item"), unrelatedItemFallback);
});

test("legacy entityClass categories normalize to resource", () => {
  const payload = {
    schema: "wikelo-normalized-v1",
    patch: { version: "4.2", build: "123", channel: "LIVE", sourceHash: "b".repeat(64), extractedAt: "2026-07-15T00:00:00Z" },
    recipes: [{ gameRecipeId: "r2", name: "Recipe", category: "entityClass", output: { gameItemId: null, name: "Output", quantity: 1 }, reputationNeeded: 0, reputationGranted: 5, components: [{ gameItemId: "i2", name: "Favor", category: "entityClass", quantity: 2 }] }],
  };
  const parsed = normalized.parseNormalizedImport(payload);
  assert.equal(parsed.recipes[0].category, "resource");
  assert.equal(parsed.recipes[0].components[0].category, "resource");
});
