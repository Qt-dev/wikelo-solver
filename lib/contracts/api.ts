export type ComponentPreferenceStatus = "needed" | "owned" | "farmable";

export type ComponentAllocation = {
  ownedQuantity: number;
  farmableQuantity: number;
};

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
  allocation: ComponentAllocation;
  unitPriceAuec: number | null;
  priceSource: string | null;
  priceLocation: string | null;
  priceCapturedAt: string | null;
  mappingStatus: "matched" | "review" | "missing";
  priceMode: "uex" | "override" | "matched_listing";
};

export type PriceSettingDto = {
  itemId: string;
  name: string;
  category: string;
  currentUexItemId: number | null;
  currentUexName: string | null;
  currentUnitPriceAuec: number | null;
  mode: "override" | "listing" | null;
  overridePriceAuec: number | null;
  matchedUexItemId: number | null;
  matchedUexName: string | null;
  updatedAt: string | null;
};

export type PriceSettingsResponse = {
  settings: PriceSettingDto[];
};

export type RecipeTodoDto = {
  recipeId: string;
  quantity: number;
  updatedAt?: string;
};

export type RecipeTodosResponse = {
  todos: RecipeTodoDto[];
};

export type RecipeDto = {
  id: string;
  name: string;
  category: string;
  output: { itemId: string | null; name: string; quantity: number };
  outputs: Array<{ itemId: string | null; name: string; quantity: number }>;
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
    outputs?: Array<{ gameItemId: string | null; name: string; quantity: number }>;
    reputationNeeded: number;
    reputationGranted: number;
    components: Array<{ gameItemId: string; name: string; category: string; quantity: number }>;
  }>;
};
