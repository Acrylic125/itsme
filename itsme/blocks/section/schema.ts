import { z } from "zod";

export const SectionBlockSchema = z.object({
  id: z.string(),
  type: z.literal("section"),
  blocks: z.array(z.string()),
  ref: z.string().optional(),
});
