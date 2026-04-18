import { z } from "zod";

export const TwoColumnListBlockSchema = z.object({
  type: z.literal("2-column-list"),
  header: z.tuple([z.string(), z.string()]).nullable(),
  points: z.array(z.tuple([z.string(), z.string()])),
});
