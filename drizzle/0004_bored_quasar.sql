CREATE TABLE `archive_projections` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`audience_role` text NOT NULL,
	`summary` text NOT NULL,
	`key_facts_json` text NOT NULL,
	`ai_generated` integer DEFAULT true NOT NULL,
	`review_status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `archive_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`audience_role` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timeline_archives` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`storage_tier` text NOT NULL,
	`event_count` integer NOT NULL,
	`revision_count` integer NOT NULL,
	`roles_json` text NOT NULL,
	`manifest_pointer` text NOT NULL,
	`checksum` text NOT NULL,
	`compression_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`verified_at` text NOT NULL
);
