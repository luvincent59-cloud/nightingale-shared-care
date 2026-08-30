CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`target_actor_id` text NOT NULL,
	`severity` text NOT NULL,
	`event_type` text NOT NULL,
	`message` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text
);
