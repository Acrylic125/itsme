import {
  check,
  primaryKey,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const BLOCK_TYPES = ["text", "section", "columns", "list", "spacer"] as const;

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

export const documentMainLayout = sqliteTable(
  "document_main_layout",
  {
    documentId: text("document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    blockId: text("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.blockId] })]
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

export const documentPageStyles = sqliteTable("document_page_styles", {
  documentId: text("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  gap: real("gap").notNull(),
  marginTop: real("margin_top").notNull(),
  marginBottom: real("margin_bottom").notNull(),
  marginLeft: real("margin_left").notNull(),
  marginRight: real("margin_right").notNull(),
});

export const documentTextStyles = sqliteTable(
  "document_text_styles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    style: text("style", { enum: ["default", "h1", "h2", "h3"] }).notNull(),
    fontSize: real("font_size").notNull(),
    fontWeight: text("font_weight", { enum: ["normal", "bold"] }).notNull(),
    fontFamily: text("font_family").notNull(),
    lineHeight: real("line_height").notNull(),
  },
  (table) => [
    uniqueIndex("document_text_styles_doc_style_uq").on(
      table.documentId,
      table.style
    ),
  ]
);

export const documentListStyles = sqliteTable("document_list_styles", {
  documentId: text("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  leftSpace: real("left_space").notNull(),
  rightSpace: real("right_space").notNull(),
});

export const textBlocks = sqliteTable("text_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  align: text("align", { enum: ["left", "center", "right"] }).notNull(),
  style: text("style", { enum: ["default", "h1", "h2", "h3"] }).notNull(),
  ref: text("ref"),
});

export const sectionBlocks = sqliteTable("section_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  ref: text("ref"),
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

export const columnsBlocks = sqliteTable("columns_blocks", {
  blockId: text("block_id")
    .primaryKey()
    .references(() => blocks.id, { onDelete: "cascade" }),
  ref: text("ref"),
});

export const columnsBlockChildren = sqliteTable("columns_block_children", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  columnsBlockId: text("columns_block_id")
    .notNull()
    .references(() => columnsBlocks.blockId, { onDelete: "cascade" }),
  childBlockId: text("child_block_id")
    .notNull()
    .references(() => blocks.id, { onDelete: "cascade" }),
  span: real("span").notNull(),
  orderIndex: integer("order_index").notNull(),
});

export const listBlocks = sqliteTable(
  "list_blocks",
  {
    blockId: text("block_id")
      .primaryKey()
      .references(() => blocks.id, { onDelete: "cascade" }),
    bulletType: text("bullet_type", {
      enum: ["normal", "alphabetical", "numerical"],
    }).notNull(),
    bulletValue: text("bullet_value"),
    leftSpace: real("left_space"),
    rightSpace: real("right_space"),
    ref: text("ref"),
  },
  (table) => [
    check(
      "list_blocks_bullet_value_for_normal_chk",
      sql`(${table.bulletType} = 'normal' and ${table.bulletValue} is not null) or (${table.bulletType} != 'normal' and ${table.bulletValue} is null)`
    ),
  ]
);

export const listBlockChildren = sqliteTable("list_block_children", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listBlockId: text("list_block_id")
    .notNull()
    .references(() => listBlocks.blockId, { onDelete: "cascade" }),
  childBlockId: text("child_block_id")
    .notNull()
    .references(() => blocks.id, { onDelete: "cascade" })
    .unique(),
  orderIndex: integer("order_index").notNull(),
});
