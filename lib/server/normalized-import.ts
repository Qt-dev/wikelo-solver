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
    recipeIds.add(recipe.gameRecipeId);
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
    }
  }
  return candidate as NormalizedImportV1;
}
