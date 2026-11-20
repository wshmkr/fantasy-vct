ALTER TABLE `matches` ADD `discord_start_posted_at` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `discord_alert_checked_at` text;--> statement-breakpoint
ALTER TABLE `stages` ADD `discord_results_posted_at` text;--> statement-breakpoint
ALTER TABLE `tournaments` ADD `discord_schedule_posted_on` text;