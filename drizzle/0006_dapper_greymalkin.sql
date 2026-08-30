CREATE TABLE `voice_records` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`language` text NOT NULL,
	`method` text NOT NULL,
	`original_text` text NOT NULL,
	`reviewed_text` text NOT NULL,
	`extraction_json` text NOT NULL,
	`created_at` text NOT NULL
);
