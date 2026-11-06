CREATE TABLE `category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`icon` text
);
--> statement-breakpoint
CREATE TABLE `claim` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`guest_key` text NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`amount` integer,
	`message` text,
	`show_name` integer DEFAULT false NOT NULL,
	`address` text,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	`released_at` integer,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claim_item_idx` ON `claim` (`item_id`);--> statement-breakpoint
CREATE INDEX `claim_guest_idx` ON `claim` (`guest_key`);--> statement-breakpoint
CREATE TABLE `editor_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`who` text NOT NULL,
	`what` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text DEFAULT 'physical' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`image_url` text,
	`store_url` text,
	`price` integer,
	`qty_wanted` integer DEFAULT 1 NOT NULL,
	`priority` text DEFAULT 'nice' NOT NULL,
	`category_id` integer,
	`notes` text,
	`used_ok` integer DEFAULT false NOT NULL,
	`goal_amount` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`seeded` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `item_category_idx` ON `item` (`category_id`);--> statement-breakpoint
CREATE TABLE `registry` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`welcome` text NOT NULL,
	`event_date` text NOT NULL,
	`event_time` text,
	`location` text,
	`map_url` text,
	`host_contact` text,
	`theme` text DEFAULT 'botanist' NOT NULL,
	`revealed` integer DEFAULT false NOT NULL,
	`revealed_at` integer,
	`revealed_by` text,
	`cover_image` text,
	`swish_number` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `thank_you` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`claim_id` integer NOT NULL,
	`sent_at` integer,
	`note` text,
	FOREIGN KEY (`claim_id`) REFERENCES `claim`(`id`) ON UPDATE no action ON DELETE cascade
);
