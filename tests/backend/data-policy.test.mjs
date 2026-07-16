import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScript } from "./ts-module-loader.mjs";

const normalized = await importTypeScript("lib/server/normalized-import.ts");
const uex = await importTypeScript("lib/server/uex.ts");
const totals = await importTypeScript("lib/server/recipe-totals.ts");

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("normalized imports require complete recipes and positive quantities", () => {
  const valid = {
    schema: "wikelo-normalized-v1",
    patch: { version: "4.2", build: "123", channel: "LIVE", sourceHash: "a".repeat(64), extractedAt: "2026-07-15T00:00:00Z" },
    recipes: [{ gameRecipeId: "r1", name: "Recipe", category: "armor", output: { gameItemId: null, name: "Output", quantity: 1 }, reputationNeeded: 0, reputationGranted: 5, components: [{ gameItemId: "i1", name: "Iron", category: "material", quantity: 2 }] }],
  };
  assert.equal(normalized.parseNormalizedImport(valid), valid);
  assert.throws(() => normalized.parseNormalizedImport({ ...valid, recipes: [{ ...valid.recipes[0], components: [] }] }), /invalid or incomplete/i);
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
  assert.deepEqual(uex.selectUexPrice({ data: [] }, { idItem: 4385, uuid: null }, payload), {
    uexItemId: 4385,
    uexCommodityUuid: null,
    priceAuec: 250000,
    priceKind: "marketplace_average",
    locationName: null,
    sourceRecordId: "wif",
  });
});

test("lowest terminal buy wins and marketplace average is fallback", () => {
  const prices = { data: [
    { id_item: 10, item_uuid: UUID_A, item_name: "Golden Medmon", terminal_name: "High", price_buy: 120, id: "1" },
    { id_item: 10, item_uuid: UUID_A, item_name: "Golden Medmon", terminal_name: "Low", price_buy: 80, id: "2" },
  ] };
  const marketplace = { data: [
    { id_item: 11, item_uuid: UUID_B, item_name: "Copper", operation: "sell", currency: "AUEC", quality_tier: 0, price_avg: 12, id: "sell" },
    { id_item: 11, item_uuid: UUID_B, item_name: "Copper", operation: "buy", currency: "AUEC", quality_tier: 1, price_avg: 20, id: "tiered" },
    { id_item: 11, item_uuid: UUID_B, item_name: "Copper", operation: "buy", currency: "AUEC", quality_tier: 0, price_avg: 47, id: "3" },
  ] };
  assert.deepEqual(uex.selectUexPrice(prices, { idItem: 10, uuid: UUID_A }, marketplace), { uexItemId: 10, uexCommodityUuid: UUID_A, priceAuec: 80, priceKind: "terminal_buy", locationName: "Low", sourceRecordId: "2" });
  assert.equal(uex.selectUexPrice(prices, { idItem: 11, uuid: UUID_B }, marketplace).priceKind, "marketplace_average");
  assert.equal(uex.selectUexPrice(prices, { idItem: 12, uuid: null }, marketplace), null);
  assert.deepEqual(uex.parseUexItems(prices), [{ idItem: 10, uuid: UUID_A, name: "Golden Medmon" }, { idItem: 10, uuid: UUID_A, name: "Golden Medmon" }]);
});

test("owned and farmable components cost zero while needed missing prices stay incomplete", () => {
  const result = totals.calculateRecipeTotal([
    { itemId: "needed-priced", quantity: 2, preference: "needed", unitPriceAuec: 10 },
    { itemId: "owned-missing", quantity: 1, preference: "owned", unitPriceAuec: null },
    { itemId: "needed-missing", quantity: 1, preference: "needed", unitPriceAuec: null },
  ]);
  assert.deepEqual(result, { valueAuec: 20, complete: false, missingItemIds: ["needed-missing"] });
});
