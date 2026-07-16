PRAGMA defer_foreign_keys = true;--> statement-breakpoint
CREATE TABLE `__new_item_mappings` (
	`item_id` text PRIMARY KEY NOT NULL,
	`uex_item_id` integer,
	`uex_commodity_uuid` text,
	`uex_name` text,
	`normalized_uex_name` text,
	`status` text DEFAULT 'missing' NOT NULL,
	`match_method` text,
	`reviewed_alias` text,
	`reviewed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_mappings_status_check" CHECK("__new_item_mappings"."status" in ('matched', 'review', 'missing')),
	CONSTRAINT "item_mappings_method_check" CHECK("__new_item_mappings"."match_method" is null or "__new_item_mappings"."match_method" in ('exact_id', 'exact_uuid', 'reviewed_alias', 'exact_normalized_name'))
);
--> statement-breakpoint
INSERT INTO `__new_item_mappings`("item_id", "uex_item_id", "uex_commodity_uuid", "uex_name", "normalized_uex_name", "status", "match_method", "reviewed_alias", "reviewed_at", "updated_at") SELECT "item_id", NULL, "uex_commodity_uuid", "uex_name", "normalized_uex_name", "status", "match_method", "reviewed_alias", "reviewed_at", "updated_at" FROM `item_mappings`;--> statement-breakpoint
DROP TABLE `item_mappings`;--> statement-breakpoint
ALTER TABLE `__new_item_mappings` RENAME TO `item_mappings`;--> statement-breakpoint
PRAGMA defer_foreign_keys = false;--> statement-breakpoint
CREATE INDEX `item_mappings_uex_item_id_idx` ON `item_mappings` (`uex_item_id`);--> statement-breakpoint
CREATE INDEX `item_mappings_uex_uuid_idx` ON `item_mappings` (`uex_commodity_uuid`);--> statement-breakpoint
CREATE TABLE `__new_price_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`uex_item_id` integer,
	`uex_commodity_uuid` text,
	`price_auec` integer NOT NULL,
	`price_kind` text NOT NULL,
	`location_name` text,
	`captured_at` text NOT NULL,
	`source` text DEFAULT 'uex' NOT NULL,
	`source_record_id` text,
	`refresh_run_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "price_snapshots_price_check" CHECK("__new_price_snapshots"."price_auec" >= 0),
	CONSTRAINT "price_snapshots_kind_check" CHECK("__new_price_snapshots"."price_kind" in ('terminal_buy', 'marketplace_average'))
);
--> statement-breakpoint
INSERT INTO `__new_price_snapshots`("id", "item_id", "uex_item_id", "uex_commodity_uuid", "price_auec", "price_kind", "location_name", "captured_at", "source", "source_record_id", "refresh_run_id", "created_at") SELECT "id", "item_id", NULL, "uex_commodity_uuid", "price_auec", "price_kind", "location_name", "captured_at", "source", "source_record_id", "refresh_run_id", "created_at" FROM `price_snapshots`;--> statement-breakpoint
DROP TABLE `price_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_price_snapshots` RENAME TO `price_snapshots`;--> statement-breakpoint
CREATE INDEX `price_snapshots_item_captured_idx` ON `price_snapshots` (`item_id`,`captured_at`);
