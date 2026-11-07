ALTER TABLE `claim` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `item` ADD `starter_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `item_starter_key_idx` ON `item` (`starter_key`);--> statement-breakpoint
ALTER TABLE `registry` ADD `starter_seeded_at` integer;