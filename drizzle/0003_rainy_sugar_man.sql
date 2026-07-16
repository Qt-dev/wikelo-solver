PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	CONSTRAINT "price_snapshots_kind_check" CHECK("__new_price_snapshots"."price_kind" in ('terminal_buy', 'marketplace_average', 'marketplace_listing'))
);
--> statement-breakpoint
INSERT INTO `__new_price_snapshots`("id", "item_id", "uex_item_id", "uex_commodity_uuid", "price_auec", "price_kind", "location_name", "captured_at", "source", "source_record_id", "refresh_run_id", "created_at") SELECT "id", "item_id", "uex_item_id", "uex_commodity_uuid", "price_auec", "price_kind", "location_name", "captured_at", "source", "source_record_id", "refresh_run_id", "created_at" FROM `price_snapshots`;--> statement-breakpoint
DROP TABLE `price_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_price_snapshots` RENAME TO `price_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `price_snapshots_item_captured_idx` ON `price_snapshots` (`item_id`,`captured_at`);
