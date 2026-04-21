import { z } from "zod";
import { TextBlockSchema, TextStyleSheetSchema } from "./text/schema";
import { SectionBlockSchema } from "./section/schema";
import { ColumnsBlockSchema } from "./columns/schema";
import { ListBlockSchema, ListStylesheetSchema } from "./list/schema";

export const BlockSchema = z.union([
  TextBlockSchema,
  SectionBlockSchema,
  ColumnsBlockSchema,
  ListBlockSchema,
]);

export type Block = z.infer<typeof BlockSchema>;

export const PageStyleSheetSchema = z.object({
  /** Vertical gap between pages, same units as `pageSize` (inches). */
  gap: z.number().default(0),
  margins: z.object({
    top: z.number(),
    bottom: z.number(),
    left: z.number(),
    right: z.number(),
  }),
});

export const StyleSheetSchema = z.object({
  page: PageStyleSheetSchema,
  text: TextStyleSheetSchema,
  list: ListStylesheetSchema,
});
