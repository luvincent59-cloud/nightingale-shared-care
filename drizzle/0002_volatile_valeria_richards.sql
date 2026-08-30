CREATE TABLE `transcript_access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`requester_id` text NOT NULL,
	`participants_json` text NOT NULL,
	`approvals_json` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`resolved_at` text
);
