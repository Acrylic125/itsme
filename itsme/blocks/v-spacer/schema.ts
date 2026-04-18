import { z } from "zod";

export const SpacerBlockSchema = z.object({
  type: z.literal("v-spacer"),
  height: z.number(),
});
