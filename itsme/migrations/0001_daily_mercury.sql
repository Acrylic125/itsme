CREATE TABLE `about_block_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` text NOT NULL,
	`point_id` text NOT NULL,
	`order_index` integer NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `about_blocks`(`block_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`point_id`) REFERENCES `points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `about_blocks` (
	`block_id` text PRIMARY KEY NOT NULL,
	`header` text NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`type` text NOT NULL,
	`order_index` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "blocks_id_format_chk" CHECK(length("blocks"."id") = 24 and "blocks"."id" like 'b_%')
);
--> statement-breakpoint
CREATE TABLE `bullet_list_blocks` (
	`block_id` text PRIMARY KEY NOT NULL,
	`header_left_content` text,
	`header_right_content` text,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bullet_list_blocks_header_pair_chk" CHECK(("bullet_list_blocks"."header_left_content" is null and "bullet_list_blocks"."header_right_content" is null) or ("bullet_list_blocks"."header_left_content" is not null and "bullet_list_blocks"."header_right_content" is not null))
);
--> statement-breakpoint
CREATE TABLE `bullet_list_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` text NOT NULL,
	`point_id` text NOT NULL,
	`order_index` integer NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `bullet_list_blocks`(`block_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`point_id`) REFERENCES `points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`project_id` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "documents_id_format_chk" CHECK(length("documents"."id") = 24 and "documents"."id" like 'd_%')
);
--> statement-breakpoint
CREATE TABLE `points` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`ref_point_id` text,
	FOREIGN KEY (`ref_point_id`) REFERENCES `points`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "points_id_format_chk" CHECK(length("points"."id") = 24 and "points"."id" like 'p_%'),
	CONSTRAINT "points_content_max_len_chk" CHECK(length("points"."content") <= 512)
);
--> statement-breakpoint
CREATE TABLE `project_master_documents` (
	`project_id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `section_block_children` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`section_block_id` text NOT NULL,
	`child_block_id` text NOT NULL,
	`order_index` integer NOT NULL,
	FOREIGN KEY (`section_block_id`) REFERENCES `section_blocks`(`block_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `section_block_children_child_block_id_unique` ON `section_block_children` (`child_block_id`);--> statement-breakpoint
CREATE TABLE `section_blocks` (
	`block_id` text PRIMARY KEY NOT NULL,
	`header_left_content` text NOT NULL,
	`header_right_content` text NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `two_column_list_blocks` (
	`block_id` text PRIMARY KEY NOT NULL,
	`header_left_content` text,
	`header_right_content` text,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "two_column_list_blocks_header_pair_chk" CHECK(("two_column_list_blocks"."header_left_content" is null and "two_column_list_blocks"."header_right_content" is null) or ("two_column_list_blocks"."header_left_content" is not null and "two_column_list_blocks"."header_right_content" is not null))
);
--> statement-breakpoint
CREATE TABLE `two_column_list_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` text NOT NULL,
	`left_point_id` text NOT NULL,
	`right_point_id` text NOT NULL,
	`order_index` integer NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `two_column_list_blocks`(`block_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`left_point_id`) REFERENCES `points`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`right_point_id`) REFERENCES `points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `v_spacer_blocks` (
	`block_id` text PRIMARY KEY NOT NULL,
	`height` integer NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `test`;