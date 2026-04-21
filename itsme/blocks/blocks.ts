import { z } from "zod";
import { TextBlockSchema, TextStyleSheetSchema } from "./text/schema";
import { SectionBlockSchema } from "./section/schema";
import { ColumnsBlockSchema } from "./columns/schema";

export const BlockSchema = z.union([
  TextBlockSchema,
  SectionBlockSchema,
  ColumnsBlockSchema,
]);

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
});
