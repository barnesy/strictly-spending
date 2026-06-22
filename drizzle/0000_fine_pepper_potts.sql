CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`institution` text NOT NULL,
	`last4` text,
	`source` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`current_balance` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_unique` ON `accounts` (`name`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`explanation` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`category` text PRIMARY KEY NOT NULL,
	`monthly_amount` real NOT NULL,
	`user_set` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`type` text NOT NULL,
	`sort_order` integer NOT NULL,
	`default_recurrence` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `csv_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`header_hash` text NOT NULL,
	`headers` text NOT NULL,
	`date_column` text NOT NULL,
	`description_column` text NOT NULL,
	`amount_column` text,
	`debit_column` text,
	`credit_column` text,
	`balance_column` text,
	`account_name` text NOT NULL,
	`account_type` text NOT NULL,
	`institution` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_contents` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`associated_checklist_id` text,
	`created_at` text NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`source` text NOT NULL,
	`imported_at` text NOT NULL,
	`row_count` integer NOT NULL,
	`new_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`content_hash` text
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`principal` real NOT NULL,
	`rate` real NOT NULL,
	`term_years` integer NOT NULL,
	`start_date` text NOT NULL,
	`category` text NOT NULL,
	`merchant` text,
	`monthly_payment` real,
	`property_value` real,
	`down_payment` real,
	`extra_monthly_payment` real,
	`extra_one_time_payment` real,
	`extra_one_time_month` integer,
	`created_at` text NOT NULL,
	`enabled` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE `merchant_overrides` (
	`merchant_key` text PRIMARY KEY NOT NULL,
	`recurrence` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`action_result` text,
	`created_at` text NOT NULL,
	`active_skill_id` text,
	`completed_stages` text,
	`steps` text,
	`token_usage` text,
	`purpose` text
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pattern` text NOT NULL,
	`category` text NOT NULL,
	`priority` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_pattern_unique` ON `rules` (`pattern`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pattern` text NOT NULL,
	`is_business` integer NOT NULL,
	`tax_category` text,
	`priority` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_rules_pattern_unique` ON `tax_rules` (`pattern`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`raw_category` text,
	`category` text NOT NULL,
	`source` text NOT NULL,
	`merchant_key` text NOT NULL,
	`user_overridden` integer DEFAULT false NOT NULL,
	`dedup_key` text NOT NULL,
	`import_batch_id` integer,
	`recurrence` text NOT NULL,
	`recurrence_override` text,
	`is_business` integer,
	`tax_category` text,
	`deduction_status` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_dedup_key_unique` ON `transactions` (`dedup_key`);