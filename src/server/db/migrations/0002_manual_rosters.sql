ALTER TABLE `pickables` ADD `on_roster` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `pickables` ADD `roster_set_manually` integer DEFAULT false NOT NULL;