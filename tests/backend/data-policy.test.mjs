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

test("UEX mapping permits exact UUID, reviewed alias, and unique normalized name only", () => {
  const commodities = [{ uuid: UUID_A, name: "Golden Medmon" }, { uuid: UUID_B, name: "Copper" }];
  assert.equal(uex.resolveUexMapping({ itemId: "1", gameItemId: UUID_A, name: "wrong" }, commodities).matchMethod, "exact_uuid");
  assert.equal(uex.resolveUexMapping({ itemId: "2", gameItemId: "game-copper", name: "wrong", reviewedAlias: " Copper " }, commodities).matchMethod, "reviewed_alias");
  assert.equal(uex.resolveUexMapping({ itemId: "3", gameItemId: "game-medmon", name: "GOLDEN   MEDMON" }, commodities).matchMethod, "exact_normalized_name");
  assert.equal(uex.resolveUexMapping({ itemId: "4", gameItemId: "game-fuzzy", name: "Golden Medmo" }, commodities).status, "missing");
});

test("lowest terminal buy wins and marketplace average is fallback", () => {
  const prices = { data: [
    { item_uuid: UUID_A, item_name: "Golden Medmon", terminal_name: "High", price_buy: 120, id: "1" },
    { item_uuid: UUID_A, item_name: "Golden Medmon", terminal_name: "Low", price_buy: 80, id: "2" },
  ] };
  const marketplace = { data: [
    { item_uuid: UUID_B, item_name: "Copper", operation: "sell", currency: "AUEC", quality_tier: 0, price_avg: 12, id: "sell" },
    { item_uuid: UUID_B, item_name: "Copper", operation: "buy", currency: "AUEC", quality_tier: 1, price_avg: 20, id: "tiered" },
    { item_uuid: UUID_B, item_name: "Copper", operation: "buy", currency: "AUEC", quality_tier: 0, price_avg: 47, id: "3" },
  ] };
  assert.deepEqual(uex.selectUexPrice(prices, UUID_A, marketplace), { uexCommodityUuid: UUID_A, priceAuec: 80, priceKind: "terminal_buy", locationName: "Low", sourceRecordId: "2" });
  assert.equal(uex.selectUexPrice(prices, UUID_B, marketplace).priceKind, "marketplace_average");
  assert.equal(uex.selectUexPrice(prices, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", marketplace), null);
  assert.deepEqual(uex.parseUexCommodities(prices), [{ uuid: UUID_A, name: "Golden Medmon" }, { uuid: UUID_A, name: "Golden Medmon" }]);
});

test("owned and farmable components cost zero while needed missing prices stay incomplete", () => {
  const result = totals.calculateRecipeTotal([
    { itemId: "needed-priced", quantity: 2, preference: "needed", unitPriceAuec: 10 },
    { itemId: "owned-missing", quantity: 1, preference: "owned", unitPriceAuec: null },
    { itemId: "needed-missing", quantity: 1, preference: "needed", unitPriceAuec: null },
  ]);
  assert.deepEqual(result, { valueAuec: 20, complete: false, missingItemIds: ["needed-missing"] });
});
