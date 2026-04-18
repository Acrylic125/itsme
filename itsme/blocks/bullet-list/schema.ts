import { z } from "zod";

export const BulletListBlockSchema = z.object({
  type: z.literal("bullet-list"),
  header: z.tuple([z.string(), z.string()]).nullable(),
  points: z.array(z.string()),
});
