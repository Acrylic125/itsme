import { z } from "zod";

export const BulletListBlockSchema = z.object({
  id: z.string(),
  type: z.literal("bullet-list"),
  header: z.tuple([z.string(), z.string()]).nullable(),
  points: z.array(
    z.object({
      refPointId: z.string().nullable(),
      value: z.string(),
    })
  ),
});
