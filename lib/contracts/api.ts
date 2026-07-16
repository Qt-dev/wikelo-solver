export type ComponentPreferenceStatus = "needed" | "owned" | "farmable";

export type PatchSummary = {
  id: string;
  version: string;
  channel: string;
  extractedAt: string;
  importedAt: string;
};

export type RecipeComponentDto = {
  itemId: string;
  uexItemId: number | null;
  uexMarketplaceUrl: string | null;
  name: string;
  category: string;
  quantity: number;
  preference: ComponentPreferenceStatus;
  unitPriceAuec: number | null;
  priceSource: string | null;
  priceLocation: string | null;
  priceCapturedAt: string | null;
  mappingStatus: "matched" | "review" | "missing";
};

export type RecipeDto = {
  id: string;
  name: string;
  category: string;
  output: { itemId: string | null; name: string; quantity: number };
  reputationNeeded: number;
  reputationGranted: number;
  components: RecipeComponentDto[];
  total: { valueAuec: number; complete: boolean; missingItemIds: string[] };
};

export type RecipesResponse = {
  patch: PatchSummary | null;
  recipes: RecipeDto[];
  freshness: { recipesStale: boolean; pricesStale: boolean; latestPriceAt: string | null };
  counts: { missingMappings: number; missingPrices: number };
  status: "ready" | "empty" | "importing";
};

export type SessionResponse = {
  user: null | { id: string; discordId: string; displayName: string; avatarUrl: string | null };
};

export type NormalizedImportV1 = {
  schema: "wikelo-normalized-v1";
  patch: { version: string; build: string; channel: string; sourceHash: string; extractedAt: string };
  recipes: Array<{
    gameRecipeId: string;
    name: string;
    category: string;
    output: { gameItemId: string | null; name: string; quantity: number };
    reputationNeeded: number;
    reputationGranted: number;
    components: Array<{ gameItemId: string; name: string; category: string; quantity: number }>;
  }>;
};
