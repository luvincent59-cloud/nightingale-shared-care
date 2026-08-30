CREATE TABLE `comment_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`version` integer NOT NULL,
	`body` text NOT NULL,
	`resolved` integer NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consult_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`interaction` text NOT NULL,
	`model` text NOT NULL,
	`participants_json` text NOT NULL,
	`messages_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`redaction_count` integer NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `note_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`patient_visible` integer NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `record_events` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`version` integer NOT NULL,
	`patient_visible` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `care_entries` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `care_entries` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `care_entries` ADD `mutation_id` text;--> statement-breakpoint
ALTER TABLE `care_plans` ADD `mutation_id` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `mutation_id` text;