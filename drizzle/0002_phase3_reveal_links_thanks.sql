ALTER TABLE `item` ADD `link_checked_at` integer;--> statement-breakpoint
ALTER TABLE `item` ADD `link_status` text;--> statement-breakpoint
ALTER TABLE `item` ADD `scraped_price` integer;--> statement-breakpoint
ALTER TABLE `registry` ADD `last_peek_at` integer;--> statement-breakpoint
ALTER TABLE `registry` ADD `last_peek_by` text;--> statement-breakpoint
CREATE UNIQUE INDEX `thank_you_claim_idx` ON `thank_you` (`claim_id`);