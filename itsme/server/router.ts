import db from "@/db/db";
import { publicProcedure, router } from "./trpc";
import { testTable } from "@/db/schema";
import { z } from "zod";
import { openaiClient } from "@/ai/openai";

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
  testAi: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const response = await openaiClient.chat.completions.create({
        model: "workers-ai/@cf/zai-org/glm-4.7-flash",
        messages: [{ role: "user", content: input.prompt }],
      });
      return response;
    }),
});
