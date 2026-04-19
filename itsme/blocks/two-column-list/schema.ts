import { z } from "zod";

export const TwoColumnListBlockSchema = z.object({
  id: z.string(),
  type: z.literal("2-column-list"),
  header: z.tuple([z.string(), z.string()]).nullable(),
  points: z.array(
    // z.object({
    //   leftPoint: z.object({
    //     id: z.string().nullable(),
    //     content: z.string(),
    //   }),
    //   rightPoint: z.object({
    //     id: z.string().nullable(),
    //     content: z.string(),
    //   }),
    // })
    z.tuple([
      z.object({
        id: z.string().nullable(),
        content: z.string(),
      }),
      z.object({
        id: z.string().nullable(),
        content: z.string(),
      }),
    ])
  ),
});
