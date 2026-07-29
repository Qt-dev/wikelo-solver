import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScript } from "./ts-module-loader.mjs";

const scunpacked = await importTypeScript("lib/server/scunpacked.ts");

const baseContract = {
  UUID: "758e6b6a-f89e-4721-ae9e-1ec27d7b2f97",
  MissionGiver: "Wikelo",
  Title: "Where Wolf? Here Wolf",
  MissionType: {
    UUID: "218523ca-53d5-4e51-b611-0c3909dd6d42",
    Name: "Wikelo - Vehicles",
  },
  RewardItems: [{
    AwardOnlyToMissionOwner: true,
    Items: [{
      Name: "Kruger L-21 Wolf Wikelo Sneak Special",
      UUID: "305052b9-dfce-4917-a909-48c1a63c6753",
      Amount: 1,
    }],
  }],
  HaulingOrders: [{
    Kind: "Entity",
    UUID: "3b1cf59f-1e6b-4a91-9edb-f8c5ddf791ae",
    Name: "Wikelo Favor",
    MinAmount: 10,
    MaxAmount: 10,
    MinScu: 0,
    MaxScu: 0,
  }],
  ReputationPrerequisite: {
    MinStanding: { Name: "Very Good Customer", MinReputation: 340 },
  },
  ReputationGained: [{ Amount: 30 }],
  NotForRelease: true,
  WorkInProgress: true,
};

test("a Wikelo contract becomes a recipe-compatible record", () => {
  const recipe = scunpacked.parseScunpackedContract(baseContract);
  assert.deepEqual(recipe, {
    gameRecipeId: "758e6b6a-f89e-4721-ae9e-1ec27d7b2f97",
    name: "Where Wolf? Here Wolf",
    category: "Wikelo - Vehicles",
    output: {
      gameItemId: "305052b9-dfce-4917-a909-48c1a63c6753",
      name: "Kruger L-21 Wolf Wikelo Sneak Special",
      quantity: 1,
      kind: "item",
      grantTiming: "mission_completion",
      externalUrl: null,
    },
    outputs: [{
      gameItemId: "305052b9-dfce-4917-a909-48c1a63c6753",
      name: "Kruger L-21 Wolf Wikelo Sneak Special",
      quantity: 1,
      kind: "item",
      grantTiming: "mission_completion",
      externalUrl: null,
    }],
    reputationNeeded: 340,
    reputationNeededLabel: "Very Good Customer",
    reputationGranted: 30,
    components: [{
      gameItemId: "3b1cf59f-1e6b-4a91-9edb-f8c5ddf791ae",
      name: "Wikelo Favor",
      category: "resource",
      quantity: 10,
    }],
    notForRelease: true,
    workInProgress: true,
  });
  assert.equal(recipe.output, recipe.outputs[0]);
});

test("resource quantities and duplicate UUIDs use the greatest positive integer", () => {
  const duplicateComponentId = "bde5a2c8-2ef4-46ac-9403-2fcb79e4016c";
  const duplicateOutputId = "4b697f15-c1e2-4b35-9b79-6bff5db9021b";
  const recipe = scunpacked.parseScunpackedContract({
    ...baseContract,
    HaulingOrders: [
      { Kind: "Resource", UUID: duplicateComponentId, Name: "Quantainium", MinAmount: 0, MaxAmount: 0, MinScu: "12", MaxScu: "24.0" },
      { Kind: "Resource", UUID: duplicateComponentId.toUpperCase(), Name: "Quantainium", MinScu: 8, MaxScu: 30 },
    ],
    RewardItems: [
      { Items: [{ UUID: duplicateOutputId, Name: "Polaris Bit", Amount: "1" }] },
      { Items: [{ UUID: duplicateOutputId.toUpperCase(), Name: "Polaris Bit", Amount: 3 }] },
    ],
  });
  assert.equal(recipe.components.length, 1);
  assert.equal(recipe.components[0].quantity, 30);
  assert.equal(recipe.outputs.length, 1);
  assert.equal(recipe.outputs[0].quantity, 3);
});

test("non-Wikelo and incomplete contracts produce no record", () => {
  assert.equal(scunpacked.parseScunpackedContract({ ...baseContract, MissionGiver: "Ruto" }), null);
  assert.equal(scunpacked.parseScunpackedContract({ ...baseContract, UUID: " " }), null);
  assert.equal(scunpacked.parseScunpackedContract({ ...baseContract, Title: null }), null);
  assert.equal(scunpacked.parseScunpackedContract({ ...baseContract, MissionType: {} }), null);
  assert.equal(scunpacked.parseScunpackedContract({ ...baseContract, HaulingOrders: [] }), null);
  assert.equal(scunpacked.parseScunpackedContract({
    ...baseContract,
    HaulingOrders: [{ Kind: "Entity", UUID: "input", Name: "Input", MaxAmount: -1 }],
  }), null);
  assert.equal(scunpacked.parseScunpackedContract({ ...baseContract, RewardItems: [] }), null);
  assert.equal(scunpacked.parseScunpackedContract("{invalid json"), null);
});

test("JSON records can be normalized in batches while invalid records are omitted", () => {
  const records = scunpacked.normalizeScunpackedContracts([
    JSON.stringify(baseContract),
    { ...baseContract, MissionGiver: "Constantine Hurston" },
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].gameRecipeId, baseContract.UUID);
  assert.equal(records[0].notForRelease, true);
});
