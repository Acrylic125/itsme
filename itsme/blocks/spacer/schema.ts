import { z } from "zod";

export const SpacerBlockSchema = z.object({
  id: z.string(),
  type: z.literal("spacer"),
  height: z.number().min(4).max(2000).default(24),
  ref: z.string().optional(),
});
