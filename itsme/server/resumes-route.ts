import { publicProcedure, router } from "./trpc";
import { z } from "zod";

const CreateProjectInputSchema = z.object({
  parsedPdf: z.object({
    name: z.string().min(1),
    type: z.literal("application/pdf"),
    size: z.number().int().positive(),
    pageCount: z.number().int().nonnegative(),
    pages: z.array(
      z.object({
        pageNumber: z.number().int().positive(),
        textItems: z.array(z.string()),
      })
    ),
  }),
});

export const resumesRouter = router({
  createProject: publicProcedure
    .input(CreateProjectInputSchema)
    .mutation(async ({ input }) => {
      console.log(JSON.stringify(input.parsedPdf, null, 2));

      return {
        projectId: "123",
      };
    }),
});
