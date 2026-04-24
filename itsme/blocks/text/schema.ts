import { z } from "zod";

export const TextStyleSchema = z.object({
  fontSize: z.number(),
  fontWeight: z.enum(["normal", "bold"]),
  fontFamily: z.string(),
  lineHeight: z.number(),
});

export const TextStyleSheetSchema = z.object({
  default: TextStyleSchema,
  h1: TextStyleSchema,
  h2: TextStyleSchema,
  h3: TextStyleSchema,
});

export const TextBlockSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  text: z.string(),
  align: z.enum(["left", "center", "right"]),
  style: z.union([
    z.literal("default"),
    z.literal("h1"),
    z.literal("h2"),
    z.literal("h3"),
  ]),
  ref: z.string().optional(),
});

export const TextBlockUpdateSchema = z.object({
  type: z.literal("text"),
  documentId: z.string(),
  blockId: z.string(),
  text: z.string(),
  align: z.enum(["left", "center", "right"]),
  style: z.union([
    z.literal("default"),
    z.literal("h1"),
    z.literal("h2"),
    z.literal("h3"),
  ]),
});
