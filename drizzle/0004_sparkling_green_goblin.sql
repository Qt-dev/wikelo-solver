CREATE TABLE `recipe_outputs` (
	`recipe_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`item_id` text,
	`output_name` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `sort_order`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "recipe_outputs_quantity_check" CHECK("recipe_outputs"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `recipe_outputs_item_id_idx` ON `recipe_outputs` (`item_id`);
--> statement-breakpoint
INSERT INTO `recipe_outputs` (`recipe_id`, `sort_order`, `item_id`, `output_name`, `quantity`)
SELECT `id`, 0, `output_item_id`, `output_name`, `output_quantity` FROM `recipes`;
