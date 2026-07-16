ALTER TABLE `recipe_outputs` ADD `output_kind` text DEFAULT 'item' NOT NULL CHECK (`output_kind` in ('item', 'blueprint'));
--> statement-breakpoint
ALTER TABLE `recipe_outputs` ADD `grant_timing` text DEFAULT 'mission_completion' NOT NULL CHECK (`grant_timing` in ('mission_start', 'mission_completion', 'other'));
--> statement-breakpoint
ALTER TABLE `recipe_outputs` ADD `external_url` text;
