CREATE TABLE `recipe_outputs` (
	`recipe_id` text NOT NULL,
	`item_id` text,
	`output_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`sort_order` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `sort_order`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recipe_outputs_item_id_idx` ON `recipe_outputs` (`item_id`);--> statement-breakpoint
ALTER TABLE `recipes` ADD `reputation_needed_label` text;