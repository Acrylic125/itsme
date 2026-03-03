import db from "@/db/db";
import { publicProcedure, router } from "./trpc";
import { testTable } from "@/db/schema";
import { z } from "zod";

export const testRouter = router({
  test: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input }) => {
      const test = await db.select().from(testTable);

      return {
        id: input.id,
      };
    }),
});
