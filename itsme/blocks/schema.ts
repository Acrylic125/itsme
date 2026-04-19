import { z } from "zod";
import { SectionBlockSchema } from "./section/schema";
import { BaseBlockSchema } from "./section/schema";

export const TextStyleSchema = z.object({
  fontSize: z.number(),
  fontWeight: z.enum(["normal", "bold"]),
  /**
   * Unitless multiplier, like CSS `line-height`.
   */
  lineHeight: z.number(),
});

export type TextStyle = z.infer<typeof TextStyleSchema>;

export const BlockWithSection = z.union([BaseBlockSchema, SectionBlockSchema]);

export type SectionBlock = z.infer<typeof SectionBlockSchema>;
export type BlockWithSection = z.infer<typeof BlockWithSection>;

export const DocumentDefinitionSchema = z.object({
  name: z.string(),
  pageSize: z.object({
    /**
     * US Letter is 8.5 x 11 (inches)
     */
    width: z.number(),
    height: z.number(),
  }),
  font: z.literal("Times New Roman"),
  spacingBelow: z.object({
    about: z.number(),
    "bullet-list": z.number(),
    "2-column-list": z.number(),
    section: z.number(),
    "v-spacer": z.number(),
  }),
  margins: z.object({
    top: z.number(),
    bottom: z.number(),
    left: z.number(),
    right: z.number(),
  }),
  textStyles: z.object({
    default: TextStyleSchema,
    h1: TextStyleSchema,
    h2: TextStyleSchema,
    h3: TextStyleSchema,
    h4: TextStyleSchema,
  }),
  bulletListStyle: z.object({
    bullet: z.string(),
    indent: z.number(),
    gap: z.number(),
  }),
  blocks: z.array(BlockWithSection),
});

export type DocumentDefinition = z.infer<typeof DocumentDefinitionSchema>;

export type Document = Omit<
  DocumentDefinition,
  "pageSize" | "margins" | "textStyles" | "bulletListStyle" | "spacingBelow"
> & {
  pageSize: { width: number; height: number };
  margins: { top: number; bottom: number; left: number; right: number };
  textStyles: DocumentDefinition["textStyles"];
  bulletListStyle: DocumentDefinition["bulletListStyle"];
  spacingBelow: DocumentDefinition["spacingBelow"];
};
