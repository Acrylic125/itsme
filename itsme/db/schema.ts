import {
  integer,
  unique,
  index,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const testTable = sqliteTable("test", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});
