CREATE TABLE `user_recipe_todos` (
	`user_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `recipe_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_recipe_todos_quantity_check" CHECK("user_recipe_todos"."quantity" between 1 and 99)
);
--> statement-breakpoint
CREATE INDEX `user_recipe_todos_recipe_idx` ON `user_recipe_todos` (`recipe_id`);