import { z } from "zod";

export const MAX_PDF_SIZE_BYTES = 256 * 1024;
export const PDF_MAGIC_HEADER = "%PDF-";
export const TEXT_SPACER = "<SPACER>";

export const PDFTextItemSchema = z.object({
  str: z.string(),
  dir: z.enum(["ltr", "rtl"]),
  width: z.number(),
  height: z.number(),
  transform: z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
  ]),
  fontName: z.string(),
  hasEOL: z.boolean(),
});

export const PDFEndMarkedContentSchema = z.object({
  type: z.literal("beginMarkedContentProps"),
  tag: z
    .union([
      z.literal("H1"),
      z.literal("H2"),
      z.literal("H3"),
      z.literal("P"),
      z.literal("LI"),
      z.literal("SPAN"),
    ])
    .default("SPAN"),
});

export const PDFStartMarkedContentSchema = z.object({
  type: z.literal("startMarkedContent"),
});

export const ExtendedPDFTextItemSchema = PDFTextItemSchema.extend({
  font: z.string(),
});

export const CreateProjectFromPdfInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("marked"),
    pages: z.array(
      z.object({
        view: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        textItems: z.array(
          z.discriminatedUnion("type", [
            ExtendedPDFTextItemSchema.extend({
              type: z.literal("text"),
            }),
            PDFStartMarkedContentSchema,
            PDFEndMarkedContentSchema,
          ])
        ),
      })
    ),
  }),
  z.object({
    type: z.literal("unmarked"),
    pages: z.array(
      z.object({
        view: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        textItems: z.array(ExtendedPDFTextItemSchema),
      })
    ),
  }),
]);

export type CreateProjectFromPdfInput = z.infer<
  typeof CreateProjectFromPdfInputSchema
>;

