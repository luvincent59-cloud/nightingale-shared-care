CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clinic_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `care_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`owner_role` text NOT NULL,
	`author_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`confidence` text NOT NULL,
	`patient_visible` integer DEFAULT false NOT NULL,
	`raw_ai` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `care_plans` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`content` text NOT NULL,
	`version` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`author_role` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`mention` text,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `highlight_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`highlight_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`decision` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
