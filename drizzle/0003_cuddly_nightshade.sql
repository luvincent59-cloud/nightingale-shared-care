CREATE TABLE `timeline_projections` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`audience_role` text NOT NULL,
	`owner_role` text NOT NULL,
	`author_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`confidence` text NOT NULL,
	`ai_generated` integer DEFAULT false NOT NULL,
	`review_status` text NOT NULL,
	`created_at` text NOT NULL
);
