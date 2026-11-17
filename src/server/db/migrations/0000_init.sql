CREATE TABLE `draft_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stage_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`action` text NOT NULL,
	`pickable_in_id` integer,
	`pickable_out_id` integer,
	`auto` integer DEFAULT false NOT NULL,
	`turn_no_before` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pickable_in_id`) REFERENCES `pickables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pickable_out_id`) REFERENCES `pickables`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_url` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` blob NOT NULL,
	`fetched_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `images_source_url_unique` ON `images` (`source_url`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`vlr_id` text NOT NULL,
	`stage_key` text NOT NULL,
	`team1_id` integer,
	`team2_id` integer,
	`best_of` integer NOT NULL,
	`scheduled_at` text,
	`status` text NOT NULL,
	`score1` integer,
	`score2` integer,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team1_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team2_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_vlr_id_unique` ON `matches` (`vlr_id`);--> statement-breakpoint
CREATE TABLE `pickables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`vlr_id` text,
	`handle` text NOT NULL,
	`team_id` integer NOT NULL,
	`is_placeholder` integer DEFAULT false NOT NULL,
	`vlr_url` text,
	`photo_image_id` integer NOT NULL,
	`top_agents_json` text DEFAULT '[]' NOT NULL,
	`form_rating` real,
	`form_acs` real,
	`form_kd` real,
	`form_rounds` integer,
	`form_fetched_at` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`photo_image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pickables_vlr_id_unique` ON `pickables` (`vlr_id`);--> statement-breakpoint
CREATE TABLE `raw_pages` (
	`url` text PRIMARY KEY NOT NULL,
	`fetched_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`html` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roster_entries` (
	`stage_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`pickable_id` integer NOT NULL,
	PRIMARY KEY(`stage_id`, `pickable_id`),
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pickable_id`) REFERENCES `pickables`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stage_managers` (
	`stage_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`seat` integer NOT NULL,
	`locked_at` text,
	PRIMARY KEY(`stage_id`, `user_id`),
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage_managers_stage_id_seat_unique` ON `stage_managers` (`stage_id`,`seat`);--> statement-breakpoint
CREATE TABLE `stage_pool` (
	`stage_id` integer NOT NULL,
	`pickable_id` integer NOT NULL,
	`removed` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`stage_id`, `pickable_id`),
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pickable_id`) REFERENCES `pickables`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`vlr_stage_keys_json` text DEFAULT '[]' NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'setup' NOT NULL,
	`pick_seconds` integer DEFAULT 90 NOT NULL,
	`current_turn_no` integer DEFAULT 0 NOT NULL,
	`turn_deadline` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vlr_id` text NOT NULL,
	`name` text NOT NULL,
	`logo_image_id` integer,
	FOREIGN KEY (`logo_image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_vlr_id_unique` ON `teams` (`vlr_id`);--> statement-breakpoint
CREATE TABLE `tournament_members` (
	`tournament_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`color` text NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`tournament_id`, `user_id`),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournament_members_tournament_id_color_unique` ON `tournament_members` (`tournament_id`,`color`);--> statement-breakpoint
CREATE TABLE `tournament_teams` (
	`tournament_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	PRIMARY KEY(`tournament_id`, `team_id`),
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`vlr_event_url` text NOT NULL,
	`vlr_event_id` text NOT NULL,
	`logo_image_id` integer,
	`joining_open` integer DEFAULT true NOT NULL,
	`scoring_json` text DEFAULT '{}' NOT NULL,
	`webhook_url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`logo_image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_vlr_event_id_unique` ON `tournaments` (`vlr_event_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`discord_username` text NOT NULL,
	`discord_id` text,
	`display_name` text,
	`avatar_url` text,
	`added_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`first_login_at` text,
	`removed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_username_unique` ON `users` (`discord_username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);