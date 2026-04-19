import { z } from "zod";

export const AboutBlockSchema = z.object({
  id: z.string(),
  type: z.literal("about"),
  header: z.string(),
  points: z.array(
    z.object({
      refPointId: z.string().nullable(),
      value: z.string(),
    })
  ),
});
