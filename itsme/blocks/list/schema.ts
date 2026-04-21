import { z } from "zod";

export const ListBulletSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("normal"),
    value: z.string(),
  }),
  z.object({
    type: z.literal("alphabetical"),
  }),
  z.object({
    type: z.literal("numerical"),
  }),
]);

/** Inches: bullet column width and gap before body text (see `ListStylesheetSchema`). */
export const ListStyleSchema = z.object({
  leftSpace: z.number(),
  rightSpace: z.number(),
});

export const ListStylesheetSchema = ListStyleSchema;

export const ListBlockSchema = z.object({
  id: z.string(),
  type: z.literal("list"),
  blocks: z.array(z.string()),
  bullet: ListBulletSchema,
  /** Inches; overrides stylesheet `list.leftSpace` when set. */
  leftSpace: z.number().optional(),
  /** Inches; overrides stylesheet `list.rightSpace` when set. */
  rightSpace: z.number().optional(),
  ref: z.string().optional(),
});
