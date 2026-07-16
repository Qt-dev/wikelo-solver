CREATE TABLE `user_price_settings` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`mode` text NOT NULL,
	`override_price_auec` integer,
	`uex_item_id` integer,
	`uex_name` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_price_settings_mode_check" CHECK("user_price_settings"."mode" in ('override', 'listing')),
	CONSTRAINT "user_price_settings_value_check" CHECK(("user_price_settings"."mode" = 'override' and "user_price_settings"."override_price_auec" is not null and "user_price_settings"."override_price_auec" >= 0) or ("user_price_settings"."mode" = 'listing' and "user_price_settings"."uex_item_id" is not null and "user_price_settings"."uex_item_id" > 0))
);
--> statement-breakpoint
CREATE INDEX `user_price_settings_item_idx` ON `user_price_settings` (`item_id`);--> statement-breakpoint
ALTER TABLE `user_component_preferences` ADD `owned_quantity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_component_preferences` ADD `farmable_quantity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `user_component_preferences`
SET `owned_quantity` = COALESCE((SELECT MAX(`quantity`) FROM `recipe_components` WHERE `recipe_components`.`item_id` = `user_component_preferences`.`item_id`), 0)
WHERE `status` = 'owned';--> statement-breakpoint
UPDATE `user_component_preferences`
SET `farmable_quantity` = COALESCE((SELECT MAX(`quantity`) FROM `recipe_components` WHERE `recipe_components`.`item_id` = `user_component_preferences`.`item_id`), 0)
WHERE `status` = 'farmable';--> statement-breakpoint
UPDATE `items` SET `category` = 'resource' WHERE LOWER(`category`) = 'entityclass';--> statement-breakpoint
UPDATE `recipe_components` SET `component_category` = 'resource' WHERE LOWER(`component_category`) = 'entityclass';
