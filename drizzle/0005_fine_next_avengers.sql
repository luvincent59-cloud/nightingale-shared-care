CREATE TABLE `care_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`highlight_id` text,
	`label` text NOT NULL,
	`assignee` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `highlight_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`entity_key` text NOT NULL,
	`label` text NOT NULL,
	`meta` text NOT NULL,
	`severity` text NOT NULL,
	`risk_reason` text NOT NULL,
	`provenance_pointer` text NOT NULL,
	`components_json` text NOT NULL,
	`base_score` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`model_version` text NOT NULL,
	`created_at` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`review_reason` text,
	`resolved_at` text,
	`resolved_by` text
);
--> statement-breakpoint
CREATE TABLE `learning_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`entity_key` text NOT NULL,
	`entry_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`signal` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` text NOT NULL
);
