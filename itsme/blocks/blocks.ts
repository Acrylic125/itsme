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

export const DEFAULT_STYLE_SHEET: z.infer<typeof StyleSheetSchema> = {
  page: {
    gap: 0.3,
    margins: {
      top: 0.45,
      bottom: 0.45,
      left: 0.45,
      right: 0.45,
    },
  },
  text: {
    default: {
      fontSize: 11,
      fontWeight: "normal",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
    h1: {
      fontSize: 16,
      fontWeight: "normal",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
    h2: {
      fontSize: 14,
      fontWeight: "bold",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
    h3: {
      fontSize: 12,
      fontWeight: "bold",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
  },
  list: {
    /** Bullet column width (inches). */
    leftSpace: 0.2,
    /** Gap between bullet column and list body (inches). */
    rightSpace: 0.1,
  },
};

export const PAGE_SIZE = {
  width: 8.5,
  height: 11,
};
