CREATE TABLE `record_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`clinician_entry_id` text NOT NULL,
	`other_entry_id` text NOT NULL,
	`claim_key` text NOT NULL,
	`clinician_value` text NOT NULL,
	`other_value` text NOT NULL,
	`reason` text NOT NULL,
	`provenance_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`reviewed_by` text,
	`review_note` text,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE TABLE `top_card_projections` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`audience_role` text NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text NOT NULL
);
