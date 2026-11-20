ALTER TABLE `matches` ADD `forfeit_winner` integer;--> statement-breakpoint
ALTER TABLE `stages` DROP COLUMN `format`;--> statement-breakpoint
ALTER TABLE `stages` DROP COLUMN `swiss_wins`;