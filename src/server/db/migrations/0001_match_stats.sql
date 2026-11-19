CREATE TABLE `match_maps` (
	`match_id` integer NOT NULL,
	`map_no` integer NOT NULL,
	`map_name` text NOT NULL,
	`team1_rounds` integer NOT NULL,
	`team2_rounds` integer NOT NULL,
	PRIMARY KEY(`match_id`, `map_no`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `player_map_stats` (
	`match_id` integer NOT NULL,
	`map_no` integer NOT NULL,
	`vlr_player_id` text NOT NULL,
	`handle` text NOT NULL,
	`team_id` integer NOT NULL,
	`k` integer NOT NULL,
	`d` integer NOT NULL,
	`a` integer NOT NULL,
	`fk` integer NOT NULL,
	`fd` integer NOT NULL,
	`mk3` integer NOT NULL,
	`mk4` integer NOT NULL,
	`aces` integer NOT NULL,
	`clutches` integer NOT NULL,
	PRIMARY KEY(`match_id`, `map_no`, `vlr_player_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sub_assignments` (
	`match_id` integer NOT NULL,
	`map_no` integer NOT NULL,
	`sub_vlr_player_id` text NOT NULL,
	`replaces_pickable_id` integer,
	PRIMARY KEY(`match_id`, `map_no`, `sub_vlr_player_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`replaces_pickable_id`) REFERENCES `pickables`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `matches` ADD `scrape_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `scrape_error` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `scraped_at` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `checked_at` text;--> statement-breakpoint
ALTER TABLE `stages` ADD `format` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `stages` ADD `swiss_wins` integer;