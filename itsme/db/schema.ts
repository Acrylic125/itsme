import {
  check,
  foreignKey,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const BLOCK_TYPES = [
  "about",
  "bullet-list",
  "2-column-list",
  "v-spacer",
  "section",
] as const;

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  userId: text("user_id").notNull(),
});

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // ownerId: text("owner_id").notNull(),
  },
  (table) => [
    check(
      "documents_id_format_chk",
      sql`length(${table.id}) = 24 and ${table.id} like 'd_%'`
    ),
  ]
);

export const projectMasterDocuments = sqliteTable("project_master_documents", {
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" })
    .primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
});

export const blocks = sqliteTable(
  "blocks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    type: text("type", { enum: BLOCK_TYPES }).notNull(),
    orderIndex: integer("order_index").notNull(),
  },
  (table) => [
    check(
      "blocks_id_format_chk",
      sql`length(${table.id}) = 24 and ${table.id} like 'b_%'`
    ),
  ]
);

export const points = sqliteTable(
  "points",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    refPointId: text("ref_point_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.refPointId],
      foreignColumns: [table.id],
      name: "points_ref_point_id_fk",
    }).onDelete("set null"),
    check(
      "points_id_format_chk",
      sql`length(${table.id}) = 24 and ${table.id} like 'p_%'`
    ),
    check("points_content_max_len_chk", sql`length(${table.content}) <= 512`),
  ]
);

export const aboutBlocks = sqliteTable("about_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  header: text("header").notNull(),
});

export const aboutBlockPoints = sqliteTable("about_block_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  blockId: text("block_id")
    .notNull()
    .references(() => aboutBlocks.blockId, { onDelete: "cascade" }),
  pointId: text("point_id")
    .notNull()
    .references(() => points.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
});

export const bulletListBlocks = sqliteTable(
  "bullet_list_blocks",
  {
    blockId: text("block_id")
      .primaryKey()
      .references(() => blocks.id, { onDelete: "cascade" }),
    headerLeftContent: text("header_left_content"),
    headerRightContent: text("header_right_content"),
  },
  (table) => [
    check(
      "bullet_list_blocks_header_pair_chk",
      sql`(${table.headerLeftContent} is null and ${table.headerRightContent} is null) or (${table.headerLeftContent} is not null and ${table.headerRightContent} is not null)`
    ),
  ]
);

export const bulletListPoints = sqliteTable("bullet_list_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  blockId: text("block_id")
    .notNull()
    .references(() => bulletListBlocks.blockId, { onDelete: "cascade" }),
  pointId: text("point_id")
    .notNull()
    .references(() => points.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
});

export const twoColumnListBlocks = sqliteTable(
  "two_column_list_blocks",
  {
    blockId: text("block_id")
      .primaryKey()
      .references(() => blocks.id, { onDelete: "cascade" }),
    headerLeftContent: text("header_left_content"),
    headerRightContent: text("header_right_content"),
  },
  (table) => [
    check(
      "two_column_list_blocks_header_pair_chk",
      sql`(${table.headerLeftContent} is null and ${table.headerRightContent} is null) or (${table.headerLeftContent} is not null and ${table.headerRightContent} is not null)`
    ),
  ]
);

export const twoColumnListRows = sqliteTable("two_column_list_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  blockId: text("block_id")
    .notNull()
    .references(() => twoColumnListBlocks.blockId, { onDelete: "cascade" }),
  leftPointId: text("left_point_id")
    .notNull()
    .references(() => points.id, { onDelete: "cascade" }),
  rightPointId: text("right_point_id")
    .notNull()
    .references(() => points.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
});

export const vSpacerBlocks = sqliteTable("v_spacer_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  height: integer("height").notNull(),
});

export const sectionBlocks = sqliteTable("section_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  headerLeftContent: text("header_left_content").notNull(),
  headerRightContent: text("header_right_content").notNull(),
});

export const sectionBlockChildren = sqliteTable("section_block_children", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sectionBlockId: text("section_block_id")
    .notNull()
    .references(() => sectionBlocks.blockId, { onDelete: "cascade" }),
  childBlockId: text("child_block_id")
    .notNull()
    .references(() => blocks.id, { onDelete: "cascade" })
    .unique(),
  orderIndex: integer("order_index").notNull(),
});
