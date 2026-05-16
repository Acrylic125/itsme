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
  /** Points; overrides `documentTextStyles` for this block when set. */
  fontSize: z.number().min(1).max(96).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  /** Multiplier; overrides `documentTextStyles` for this block when set. */
  lineHeight: z.number().min(0.5).max(4).optional(),
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
  fontSize: z.number().min(1).max(96).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  lineHeight: z.number().min(0.5).max(4).optional(),
});

export function clampTextEditFontSizePt(n: number) {
  return Math.min(96, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));
}

export const TEXT_LINE_HEIGHT_PRESETS = [1, 1.5, 2] as const;

export function clampTextEditLineHeight(n: number) {
  const rounded = Math.round((Number.isFinite(n) ? n : 1.2) * 100) / 100;
  return Math.min(4, Math.max(0.5, rounded));
}
