PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_game_patches` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`build` text NOT NULL,
	`channel` text NOT NULL,
	`source_hash` text NOT NULL,
	`source` text NOT NULL DEFAULT 'game-client',
	`source_revision` text,
	`source_url` text,
	`extracted_at` text NOT NULL,
	`last_checked_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`imported_at` text NOT NULL,
	`activation_state` text DEFAULT 'staging' NOT NULL,
	CONSTRAINT "game_patches_activation_state_check" CHECK("__new_game_patches"."activation_state" in ('staging', 'active', 'previous', 'archived'))
);
--> statement-breakpoint
INSERT INTO `__new_game_patches` (`id`, `version`, `build`, `channel`, `source_hash`, `extracted_at`, `imported_at`, `activation_state`)
SELECT `id`, `version`, `build`, `channel`, `source_hash`, `extracted_at`, `imported_at`, `activation_state` FROM `game_patches`;
--> statement-breakpoint
DROP TABLE `game_patches`;
--> statement-breakpoint
ALTER TABLE `__new_game_patches` RENAME TO `game_patches`;
--> statement-breakpoint
CREATE UNIQUE INDEX `game_patches_source_hash_unique` ON `game_patches` (`source_hash`);
--> statement-breakpoint
CREATE INDEX `game_patches_activation_idx` ON `game_patches` (`activation_state`, `imported_at`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
ALTER TABLE `recipes` ADD `not_for_release` integer NOT NULL DEFAULT 0;
