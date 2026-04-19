import { z } from "zod";

export const SpacerBlockSchema = z.object({
  id: z.string(),
  type: z.literal("v-spacer"),
  height: z.number(),
});
