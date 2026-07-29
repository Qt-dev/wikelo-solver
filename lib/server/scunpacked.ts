export type ScunpackedRecipeOutput = {
  gameItemId: string;
  name: string;
  quantity: number;
  kind: "item";
  grantTiming: "mission_completion";
  externalUrl: null;
};

export type ScunpackedRecipeComponent = {
  gameItemId: string;
  name: string;
  category: string;
  quantity: number;
};

export type ScunpackedRecipe = {
  gameRecipeId: string;
  name: string;
  category: string;
  output: ScunpackedRecipeOutput;
  outputs: ScunpackedRecipeOutput[];
  reputationNeeded: number;
  reputationNeededLabel: string | null;
  reputationGranted: number;
  components: ScunpackedRecipeComponent[];
  notForRelease: boolean;
  workInProgress: boolean;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function positiveInteger(value: unknown): number | null {
  if (
    typeof value === "string" &&
    !/^\+?\d+(?:\.0+)?$/.test(value.trim())
  ) {
    return null;
  }
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  if (
    typeof value === "string" &&
    !/^\+?\d+(?:\.0+)?$/.test(value.trim())
  ) {
    return null;
  }
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function greatestPositiveInteger(...values: unknown[]): number | null {
  let greatest: number | null = null;
  for (const value of values) {
    const parsed = positiveInteger(value);
    if (parsed !== null && (greatest === null || parsed > greatest)) {
      greatest = parsed;
    }
  }
  return greatest;
}

function categoryForOrder(kind: string) {
  const normalized = kind.toLocaleLowerCase("en-US");
  return normalized === "entity" || normalized === "entityclass"
    ? "resource"
    : normalized;
}

function dedupeByGameUuid<T extends { gameItemId: string; quantity: number }>(
  entries: T[],
): T[] {
  const positions = new Map<string, number>();
  const deduped: T[] = [];
  for (const entry of entries) {
    const key = entry.gameItemId.toLocaleLowerCase("en-US");
    const position = positions.get(key);
    if (position === undefined) {
      positions.set(key, deduped.length);
      deduped.push(entry);
    } else if (entry.quantity > deduped[position].quantity) {
      deduped[position] = entry;
    }
  }
  return deduped;
}

function parseComponents(value: unknown): ScunpackedRecipeComponent[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parsed: ScunpackedRecipeComponent[] = [];
  for (const candidate of value) {
    const order = record(candidate);
    const gameItemId = text(order?.UUID);
    const name = text(order?.Name);
    const kind = text(order?.Kind);
    const quantity = greatestPositiveInteger(
      order?.MinAmount,
      order?.MaxAmount,
      order?.MinScu,
      order?.MaxScu,
      order?.Amount,
      order?.Quantity,
    );
    if (!order || !gameItemId || !name || !kind || quantity === null) return null;
    parsed.push({
      gameItemId,
      name,
      category: categoryForOrder(kind),
      quantity,
    });
  }
  return dedupeByGameUuid(parsed);
}

function parseOutputs(value: unknown): ScunpackedRecipeOutput[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parsed: ScunpackedRecipeOutput[] = [];
  for (const candidate of value) {
    const reward = record(candidate);
    if (!reward || !Array.isArray(reward.Items) || reward.Items.length === 0) {
      return null;
    }
    for (const itemCandidate of reward.Items) {
      const item = record(itemCandidate);
      const gameItemId = text(item?.UUID);
      const name = text(item?.Name);
      const quantity = greatestPositiveInteger(item?.Amount, item?.Quantity);
      if (!item || !gameItemId || !name || quantity === null) return null;
      parsed.push({
        gameItemId,
        name,
        quantity,
        kind: "item",
        grantTiming: "mission_completion",
        externalUrl: null,
      });
    }
  }
  const deduped = dedupeByGameUuid(parsed);
  return deduped.length > 0 ? deduped : null;
}

function parseReputationPrerequisite(contract: UnknownRecord) {
  const prerequisite = record(contract.ReputationPrerequisite);
  const standing = record(prerequisite?.MinStanding);
  return {
    reputationNeeded: nonNegativeInteger(standing?.MinReputation) ?? 0,
    reputationNeededLabel: text(standing?.Name),
  };
}

function parseReputationGranted(value: unknown) {
  if (!Array.isArray(value)) return 0;
  let total = 0;
  for (const candidate of value) {
    const gained = record(candidate);
    const amount = positiveInteger(gained?.Amount);
    if (amount !== null && Number.isSafeInteger(total + amount)) total += amount;
  }
  return total;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseScunpackedContract(value: unknown): ScunpackedRecipe | null {
  const contract = record(parseJson(value));
  if (!contract || text(contract.MissionGiver)?.toLocaleLowerCase("en-US") !== "wikelo") {
    return null;
  }

  const gameRecipeId = text(contract.UUID);
  const name = text(contract.Title);
  const missionType = record(contract.MissionType);
  const category = text(missionType?.Name);
  const components = parseComponents(contract.HaulingOrders);
  const outputs = parseOutputs(contract.RewardItems);
  if (!gameRecipeId || !name || !category || !components || !outputs) return null;

  const reputation = parseReputationPrerequisite(contract);
  return {
    gameRecipeId,
    name,
    category,
    output: outputs[0],
    outputs,
    ...reputation,
    reputationGranted: parseReputationGranted(contract.ReputationGained),
    components,
    notForRelease: contract.NotForRelease === true,
    workInProgress: contract.WorkInProgress === true,
  };
}

export function normalizeScunpackedContracts(
  values: Iterable<unknown>,
): ScunpackedRecipe[] {
  const recipes: ScunpackedRecipe[] = [];
  for (const value of values) {
    const recipe = parseScunpackedContract(value);
    if (recipe) recipes.push(recipe);
  }
  return recipes;
}
