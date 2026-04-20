import { compressJSONSchema } from "@/lib/compress-zod";
import { publicProcedure, router } from "./trpc";
import { z } from "zod";
import { BlockWithSection, DocumentDefinitionSchema } from "@/blocks/schema";
import openai from "openai";
import { openaiClient } from "@/ai/openai";

export const resumesRouter = router({
  createProject: publicProcedure
    .input(
      z.object({
        // parsedPdf: z.object({
        //   pages: z.array(
        //     z.object({
        //       pageNumber: z.number(),
        //       textItems: z.array(z.string()),
        //     })
        //   ),
        // }),
        textItems: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const blockWithSectionSchemaType = compressJSONSchema(
        BlockWithSection.toJSONSchema()
      );

      const prompt = `Convert the USER_INPUT into a blocks. Make a best guess as to what blocks should be created.
<USER_INPUT>
${input.textItems.join("\n")}
</USER_INPUT>
<SCHEMA>
${blockWithSectionSchemaType}
</SCHEMA>
Instructions:
- Strip away any special characters.
- Do not add any additional properties that are not in the schema.
- Although the headers are marked, they are guesses. Infer the headers from the text items.
- Only output the JSON object, no comments, explanations or whitespace.
- a <SPACER> indicates that there is some separation between blocks.`;

      console.log(prompt);
      // const response = await openaiClient.chat.completions.create({
      //   // model: "workers-ai/@cf/zai-org/glm-4.7-flash",
      //   // model: "workers-ai/@cf/google/gemma-3-12b-it",
      //   model: "workers-ai/@cf/google/gemma-4-26b-a4b-it",
      //   messages: [{ role: "user", content: prompt }],
      // });
      // console.log(response.choices[0].message.content);
      return {
        projectId: "123",
      };
    }),
});
