import type { NormalizedImportV1 } from "@/lib/contracts/api";
import { HttpError } from "./http";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function normalizeItemName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function parseNormalizedImport(value: unknown): NormalizedImportV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Import body must be an object.", "invalid_import");
  }
  const candidate = value as Partial<NormalizedImportV1>;
  const patch = candidate.patch;
  if (
    candidate.schema !== "wikelo-normalized-v1" ||
    !patch ||
    !nonEmpty(patch.version) ||
    !nonEmpty(patch.build) ||
    !nonEmpty(patch.channel) ||
    !/^[a-fA-F0-9]{64}$/.test(patch.sourceHash ?? "") ||
    !nonEmpty(patch.extractedAt) ||
    Number.isNaN(Date.parse(patch.extractedAt)) ||
    !Array.isArray(candidate.recipes) ||
    candidate.recipes.length === 0
  ) {
    throw new HttpError(400, "Import metadata is invalid or incomplete.", "invalid_import");
  }

  const recipeIds = new Set<string>();
  for (const [recipeIndex, recipe] of candidate.recipes.entries()) {
    if (
      !recipe ||
      !nonEmpty(recipe.gameRecipeId) ||
      recipeIds.has(recipe.gameRecipeId) ||
      !nonEmpty(recipe.name) ||
      !nonEmpty(recipe.category) ||
      !recipe.output ||
      (recipe.output.gameItemId !== null && !nonEmpty(recipe.output.gameItemId)) ||
      !nonEmpty(recipe.output.name) ||
      !positiveInteger(recipe.output.quantity) ||
      !nonNegativeInteger(recipe.reputationNeeded) ||
      !nonNegativeInteger(recipe.reputationGranted) ||
      !Array.isArray(recipe.components) ||
      recipe.components.length === 0
    ) {
      throw new HttpError(400, `Recipe ${recipeIndex} is invalid or incomplete.`, "invalid_import");
    }
    const outputs = recipe.outputs?.length ? recipe.outputs : [recipe.output];
    const outputIds = new Set<string>();
    for (const [outputIndex, output] of outputs.entries()) {
      const validKind = output?.kind === undefined || output.kind === "item" || output.kind === "blueprint";
      const validTiming = output?.grantTiming === undefined || output.grantTiming === "mission_start" || output.grantTiming === "mission_completion" || output.grantTiming === "other";
      const validExternalUrl = output?.externalUrl === undefined || output.externalUrl === null || /^https:\/\/scmdb\.net\/\?page=fab&fab=[A-Za-z0-9_%.-]+$/.test(output.externalUrl);
      if (
        !output ||
        (output.gameItemId !== null && (!nonEmpty(output.gameItemId) || outputIds.has(output.gameItemId))) ||
        !nonEmpty(output.name) ||
        !positiveInteger(output.quantity) ||
        !validKind ||
        !validTiming ||
        !validExternalUrl
      ) {
        throw new HttpError(400, `Recipe ${recipeIndex} output ${outputIndex} is invalid or duplicated.`, "invalid_import");
      }
      output.kind ??= "item";
      output.grantTiming ??= "mission_completion";
      output.externalUrl ??= null;
      if (output.gameItemId) outputIds.add(output.gameItemId);
    }
    recipe.outputs = outputs;
    recipe.output = outputs[0];
    recipeIds.add(recipe.gameRecipeId);
    if (recipe.category.toLocaleLowerCase("en-US") === "entityclass") recipe.category = "resource";
    const componentIds = new Set<string>();
    for (const [componentIndex, component] of recipe.components.entries()) {
      if (
        !component ||
        !nonEmpty(component.gameItemId) ||
        componentIds.has(component.gameItemId) ||
        !nonEmpty(component.name) ||
        !nonEmpty(component.category) ||
        !positiveInteger(component.quantity)
      ) {
        throw new HttpError(
          400,
          `Recipe ${recipeIndex} component ${componentIndex} is invalid or duplicated.`,
          "invalid_import",
        );
      }
      componentIds.add(component.gameItemId);
      if (component.category.toLocaleLowerCase("en-US") === "entityclass") component.category = "resource";
    }
  }
  return candidate as NormalizedImportV1;
}
