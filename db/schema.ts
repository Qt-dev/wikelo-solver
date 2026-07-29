import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const gamePatches = sqliteTable(
  "game_patches",
  {
    id: text("id").primaryKey(),
    version: text("version").notNull(),
    build: text("build").notNull(),
    channel: text("channel").notNull(),
    sourceHash: text("source_hash").notNull(),
    source: text("source").notNull().default("game-client"),
    sourceRevision: text("source_revision"),
    sourceUrl: text("source_url"),
    extractedAt: text("extracted_at").notNull(),
    lastCheckedAt: text("last_checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    importedAt: text("imported_at").notNull(),
    activationState: text("activation_state", {
      enum: ["staging", "active", "previous", "archived"],
    })
      .notNull()
      .default("staging"),
  },
  (table) => [
    uniqueIndex("game_patches_source_hash_unique").on(table.sourceHash),
    index("game_patches_activation_idx").on(table.activationState, table.importedAt),
    check(
      "game_patches_activation_state_check",
      sql`${table.activationState} in ('staging', 'active', 'previous', 'archived')`,
    ),
  ],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    gameItemId: text("game_item_id").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    category: text("category").notNull().default("unknown"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("items_game_item_id_unique").on(table.gameItemId),
    index("items_normalized_name_idx").on(table.normalizedName),
  ],
);

export const itemMappings = sqliteTable(
  "item_mappings",
  {
    itemId: text("item_id")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),
    uexItemId: integer("uex_item_id"),
    uexCommodityUuid: text("uex_commodity_uuid"),
    uexName: text("uex_name"),
    normalizedUexName: text("normalized_uex_name"),
    status: text("status", { enum: ["matched", "review", "missing"] })
      .notNull()
      .default("missing"),
    matchMethod: text("match_method", {
      enum: ["exact_id", "exact_uuid", "reviewed_alias", "exact_normalized_name"],
    }),
    reviewedAlias: text("reviewed_alias"),
    reviewedAt: text("reviewed_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("item_mappings_uex_item_id_idx").on(table.uexItemId),
    index("item_mappings_uex_uuid_idx").on(table.uexCommodityUuid),
    check("item_mappings_status_check", sql`${table.status} in ('matched', 'review', 'missing')`),
    check(
      "item_mappings_method_check",
      sql`${table.matchMethod} is null or ${table.matchMethod} in ('exact_id', 'exact_uuid', 'reviewed_alias', 'exact_normalized_name')`,
    ),
  ],
);

export const recipes = sqliteTable(
  "recipes",
  {
    id: text("id").primaryKey(),
    patchId: text("patch_id")
      .notNull()
      .references(() => gamePatches.id, { onDelete: "cascade" }),
    gameRecipeId: text("game_recipe_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    outputItemId: text("output_item_id").references(() => items.id, { onDelete: "set null" }),
    outputName: text("output_name").notNull(),
    outputQuantity: integer("output_quantity").notNull(),
    reputationNeeded: integer("reputation_needed").notNull().default(0),
    reputationNeededLabel: text("reputation_needed_label"),
    reputationGranted: integer("reputation_granted").notNull().default(0),
    notForRelease: integer("not_for_release", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    uniqueIndex("recipes_patch_game_recipe_unique").on(table.patchId, table.gameRecipeId),
    index("recipes_patch_id_idx").on(table.patchId),
  ],
);

export const recipeOutputs = sqliteTable(
  "recipe_outputs",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    outputName: text("output_name").notNull(),
    quantity: integer("quantity").notNull(),
    outputKind: text("output_kind", { enum: ["item", "blueprint"] }).notNull().default("item"),
    grantTiming: text("grant_timing", { enum: ["mission_start", "mission_completion", "other"] }).notNull().default("mission_completion"),
    externalUrl: text("external_url"),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.sortOrder] }),
    index("recipe_outputs_item_id_idx").on(table.itemId),
    check("recipe_outputs_quantity_check", sql`${table.quantity} > 0`),
    check("recipe_outputs_kind_check", sql`${table.outputKind} in ('item', 'blueprint')`),
    check("recipe_outputs_grant_timing_check", sql`${table.grantTiming} in ('mission_start', 'mission_completion', 'other')`),
  ],
);

export const recipeComponents = sqliteTable(
  "recipe_components",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    componentName: text("component_name").notNull(),
    componentCategory: text("component_category").notNull(),
    quantity: integer("quantity").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.itemId] }),
    index("recipe_components_item_id_idx").on(table.itemId),
  ],
);

export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    uexItemId: integer("uex_item_id"),
    uexCommodityUuid: text("uex_commodity_uuid"),
    priceAuec: integer("price_auec").notNull(),
    priceKind: text("price_kind", { enum: ["terminal_buy", "marketplace_average", "marketplace_listing"] }).notNull(),
    locationName: text("location_name"),
    capturedAt: text("captured_at").notNull(),
    source: text("source").notNull().default("uex"),
    sourceRecordId: text("source_record_id"),
    refreshRunId: text("refresh_run_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("price_snapshots_item_captured_idx").on(table.itemId, table.capturedAt),
    check("price_snapshots_price_check", sql`${table.priceAuec} >= 0`),
    check(
      "price_snapshots_kind_check",
      sql`${table.priceKind} in ('terminal_buy', 'marketplace_average', 'marketplace_listing')`,
    ),
  ],
);

export const importRuns = sqliteTable(
  "import_runs",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    bodyHash: text("body_hash").notNull(),
    sourceHash: text("source_hash"),
    patchId: text("patch_id"),
    status: text("status", { enum: ["processing", "completed", "failed", "idempotent"] })
      .notNull(),
    receivedAt: text("received_at").notNull(),
    completedAt: text("completed_at"),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("import_runs_request_id_unique").on(table.requestId),
    index("import_runs_source_hash_idx").on(table.sourceHash, table.status),
    check(
      "import_runs_status_check",
      sql`${table.status} in ('processing', 'completed', 'failed', 'idempotent')`,
    ),
  ],
);

export const priceRefreshRuns = sqliteTable("price_refresh_runs", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  bodyHash: text("body_hash").notNull(),
  status: text("status", { enum: ["processing", "completed", "failed"] }).notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  itemCount: integer("item_count").notNull().default(0),
  snapshotCount: integer("snapshot_count").notNull().default(0),
  error: text("error"),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    discordId: text("discord_id").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("users_discord_id_unique").on(table.discordId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_expiry_idx").on(table.userId, table.expiresAt),
  ],
);

export const userComponentPreferences = sqliteTable(
  "user_component_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["needed", "owned", "farmable"] }).notNull(),
    ownedQuantity: integer("owned_quantity").notNull().default(0),
    farmableQuantity: integer("farmable_quantity").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
    index("user_component_preferences_item_id_idx").on(table.itemId),
    check(
      "user_component_preferences_status_check",
      sql`${table.status} in ('needed', 'owned', 'farmable')`,
    ),
  ],
);

export const userPriceSettings = sqliteTable(
  "user_price_settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["override", "listing"] }).notNull(),
    overridePriceAuec: integer("override_price_auec"),
    uexItemId: integer("uex_item_id"),
    uexName: text("uex_name"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
    index("user_price_settings_item_idx").on(table.itemId),
    check("user_price_settings_mode_check", sql`${table.mode} in ('override', 'listing')`),
    check(
      "user_price_settings_value_check",
      sql`(${table.mode} = 'override' and ${table.overridePriceAuec} is not null and ${table.overridePriceAuec} >= 0) or (${table.mode} = 'listing' and ${table.uexItemId} is not null and ${table.uexItemId} > 0)`,
    ),
  ],
);

export const userRecipeTodos = sqliteTable(
  "user_recipe_todos",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.recipeId] }),
    index("user_recipe_todos_recipe_idx").on(table.recipeId),
    check("user_recipe_todos_quantity_check", sql`${table.quantity} between 1 and 99`),
  ],
);
