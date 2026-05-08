import { z } from "zod";

export const ColumnsBlockSchema = z.object({
  id: z.string(),
  type: z.literal("columns"),
  blocks: z.array(
    z.object({
      span: z.number(),
      blockId: z.string(),
    })
  ),
  ref: z.string().optional(),
});

export const ColumnsSpansUpdateSchema = z.object({
  type: z.literal("columns_spans"),
  documentId: z.string(),
  columnsBlockId: z.string(),
  spans: z.array(z.number().positive()),
});
