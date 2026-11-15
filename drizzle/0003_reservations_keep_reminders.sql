ALTER TABLE `claim` ADD `reminded_at` integer;--> statement-breakpoint
ALTER TABLE `claim` ADD `reminder_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `claim` SET `expires_at` = NULL WHERE `status` = 'reserved';
