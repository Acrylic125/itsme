import { z } from "zod";

export const AboutBlockSchema = z.object({
  type: z.literal("about"),
  header: z.string(),
  points: z.array(z.string()),
});
