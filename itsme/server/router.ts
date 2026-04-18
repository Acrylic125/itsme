import { publicProcedure, router } from "./trpc";
import { z } from "zod";
import { openaiClient } from "@/ai/openai";

export const testRouter = router({
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
