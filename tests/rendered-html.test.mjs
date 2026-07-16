import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the app shell uses live Wikelo product metadata", async () => {
  const [page, layout, planner, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/RecipePlanner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /RecipePlanner/);
  assert.match(layout, /Wikelo Solver/);
  assert.match(layout, /extracted recipe data/);
  assert.match(planner, /\/api\/recipes/);
  assert.match(planner, /\/auth\/discord\/start/);
  assert.match(planner, /Owned/);
  assert.match(planner, /Farmable/);
  assert.match(planner, /Cards/);
  assert.match(planner, /Change recipe/);
  assert.match(planner, /recipe-focus/);
  assert.match(planner, /\/api\/todos/);
  assert.match(planner, /To-do list/);
  assert.match(planner, /Combined materials/);
  assert.match(planner, /Hide search/);
  assert.doesNotMatch(planner, /Search recipe, output, component, or category/);
  assert.doesNotMatch(`${layout}\n${planner}`, /sample-data|Sample data|Future account sync/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
