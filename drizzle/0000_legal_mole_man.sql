CREATE TABLE `game_patches` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`build` text NOT NULL,
	`channel` text NOT NULL,
	`source_hash` text NOT NULL,
	`extracted_at` text NOT NULL,
	`imported_at` text NOT NULL,
	`activation_state` text DEFAULT 'staging' NOT NULL,
	CONSTRAINT "game_patches_activation_state_check" CHECK("game_patches"."activation_state" in ('staging', 'active', 'previous', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_patches_source_hash_unique` ON `game_patches` (`source_hash`);--> statement-breakpoint
CREATE INDEX `game_patches_activation_idx` ON `game_patches` (`activation_state`,`imported_at`);--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`body_hash` text NOT NULL,
	`source_hash` text,
	`patch_id` text,
	`status` text NOT NULL,
	`received_at` text NOT NULL,
	`completed_at` text,
	`error` text,
	CONSTRAINT "import_runs_status_check" CHECK("import_runs"."status" in ('processing', 'completed', 'failed', 'idempotent'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_runs_request_id_unique` ON `import_runs` (`request_id`);--> statement-breakpoint
CREATE INDEX `import_runs_source_hash_idx` ON `import_runs` (`source_hash`,`status`);--> statement-breakpoint
CREATE TABLE `item_mappings` (
	`item_id` text PRIMARY KEY NOT NULL,
	`uex_commodity_uuid` text,
	`uex_name` text,
	`normalized_uex_name` text,
	`status` text DEFAULT 'missing' NOT NULL,
	`match_method` text,
	`reviewed_alias` text,
	`reviewed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_mappings_status_check" CHECK("item_mappings"."status" in ('matched', 'review', 'missing')),
	CONSTRAINT "item_mappings_method_check" CHECK("item_mappings"."match_method" is null or "item_mappings"."match_method" in ('exact_uuid', 'reviewed_alias', 'exact_normalized_name'))
);
--> statement-breakpoint
CREATE INDEX `item_mappings_uex_uuid_idx` ON `item_mappings` (`uex_commodity_uuid`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`game_item_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`category` text DEFAULT 'unknown' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_game_item_id_unique` ON `items` (`game_item_id`);--> statement-breakpoint
CREATE INDEX `items_normalized_name_idx` ON `items` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `price_refresh_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`body_hash` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`item_count` integer DEFAULT 0 NOT NULL,
	`snapshot_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_refresh_runs_request_id_unique` ON `price_refresh_runs` (`request_id`);--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`uex_commodity_uuid` text NOT NULL,
	`price_auec` integer NOT NULL,
	`price_kind` text NOT NULL,
	`location_name` text,
	`captured_at` text NOT NULL,
	`source` text DEFAULT 'uex' NOT NULL,
	`source_record_id` text,
	`refresh_run_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "price_snapshots_price_check" CHECK("price_snapshots"."price_auec" >= 0),
	CONSTRAINT "price_snapshots_kind_check" CHECK("price_snapshots"."price_kind" in ('terminal_buy', 'marketplace_average'))
);
--> statement-breakpoint
CREATE INDEX `price_snapshots_item_captured_idx` ON `price_snapshots` (`item_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `recipe_components` (
	`recipe_id` text NOT NULL,
	`item_id` text NOT NULL,
	`component_name` text NOT NULL,
	`component_category` text NOT NULL,
	`quantity` integer NOT NULL,
	`sort_order` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `item_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `recipe_components_item_id_idx` ON `recipe_components` (`item_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`patch_id` text NOT NULL,
	`game_recipe_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`output_item_id` text,
	`output_name` text NOT NULL,
	`output_quantity` integer NOT NULL,
	`reputation_needed` integer DEFAULT 0 NOT NULL,
	`reputation_granted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`patch_id`) REFERENCES `game_patches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`output_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_patch_game_recipe_unique` ON `recipes` (`patch_id`,`game_recipe_id`);--> statement-breakpoint
CREATE INDEX `recipes_patch_id_idx` ON `recipes` (`patch_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_expiry_idx` ON `sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `user_component_preferences` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_component_preferences_status_check" CHECK("user_component_preferences"."status" in ('needed', 'owned', 'farmable'))
);
--> statement-breakpoint
CREATE INDEX `user_component_preferences_item_id_idx` ON `user_component_preferences` (`item_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`discord_id` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);