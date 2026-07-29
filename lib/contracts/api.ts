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

export type RecipeOutputDto = {
  itemId: string | null;
  name: string;
  quantity: number;
  kind: "item" | "blueprint";
  grantTiming: "mission_start" | "mission_completion" | "other";
  externalUrl: string | null;
};

export type RecipeTodosResponse = {
  todos: RecipeTodoDto[];
};

export type RecipeDto = {
  id: string;
  name: string;
  category: string;
  output: RecipeOutputDto;
  outputs: RecipeOutputDto[];
  reputationNeeded: number;
  reputationNeededLabel: string | null;
  reputationGranted: number;
  notForRelease: boolean;
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
  schema: "wikelo-normalized-v1" | "wikelo-normalized-v2";
  patch: {
    version: string;
    build: string;
    channel: string;
    sourceHash: string;
    extractedAt: string;
    source?: string;
    sourceRevision?: string | null;
    sourceUrl?: string | null;
  };
  recipes: Array<{
    gameRecipeId: string;
    name: string;
    category: string;
    output: { gameItemId: string | null; name: string; quantity: number; kind?: "item" | "blueprint"; grantTiming?: "mission_start" | "mission_completion" | "other"; externalUrl?: string | null };
    outputs?: Array<{ gameItemId: string | null; name: string; quantity: number; kind?: "item" | "blueprint"; grantTiming?: "mission_start" | "mission_completion" | "other"; externalUrl?: string | null }>;
    reputationNeeded: number;
    reputationNeededLabel?: string | null;
    reputationGranted: number;
    notForRelease?: boolean;
    sourcePath?: string | null;
    components: Array<{ gameItemId: string; name: string; category: string; quantity: number }>;
  }>;
};

export type UexPriceKind = "terminal_buy" | "marketplace_average" | "marketplace_listing";

export type UexPriceContextV1 = {
  schema: "wikelo-uex-context-v1";
  patchId: string;
  candidates: Array<{ itemId: string; gameItemId: string; name: string; reviewedAlias: string | null; existingUexItemId: number | null; existingUexUuid: string | null }>;
  customListings: Array<{ itemId: string; uexItemId: number }>;
};

export type UexPriceImportV1 = {
  schema: "wikelo-uex-import-v1";
  patchId: string;
  capturedAt: string;
  source: { itemsUrl: string; marketplaceUrl: string; revision: string };
  mappings: Array<{ itemId: string; uexItemId: number | null; uexCommodityUuid: string | null; uexName: string | null; status: "matched" | "review" | "missing"; matchMethod: "exact_id" | "exact_uuid" | "reviewed_alias" | "exact_normalized_name" | null }>;
  snapshots: Array<{ itemId: string; uexItemId: number; uexCommodityUuid: string | null; priceAuec: number; priceKind: UexPriceKind; locationName: string | null; sourceRecordId: string | null; source?: string }>;
};
