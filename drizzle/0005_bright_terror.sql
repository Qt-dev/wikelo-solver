PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_recipe_outputs` (
	`recipe_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`item_id` text,
	`output_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`output_kind` text DEFAULT 'item' NOT NULL,
	`grant_timing` text DEFAULT 'mission_completion' NOT NULL,
	`external_url` text,
	PRIMARY KEY(`recipe_id`, `sort_order`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "recipe_outputs_quantity_check" CHECK("__new_recipe_outputs"."quantity" > 0),
	CONSTRAINT "recipe_outputs_kind_check" CHECK("__new_recipe_outputs"."output_kind" in ('item', 'blueprint')),
	CONSTRAINT "recipe_outputs_grant_timing_check" CHECK("__new_recipe_outputs"."grant_timing" in ('mission_start', 'mission_completion', 'other'))
);
--> statement-breakpoint
INSERT INTO `__new_recipe_outputs`("recipe_id", "sort_order", "item_id", "output_name", "quantity", "output_kind", "grant_timing", "external_url") SELECT "recipe_id", "sort_order", "item_id", "output_name", "quantity", 'item', 'mission_completion', NULL FROM `recipe_outputs`;--> statement-breakpoint
DROP TABLE `recipe_outputs`;--> statement-breakpoint
ALTER TABLE `__new_recipe_outputs` RENAME TO `recipe_outputs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `recipe_outputs_item_id_idx` ON `recipe_outputs` (`item_id`);
