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
