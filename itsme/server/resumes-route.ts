import { CreateProjectFromPdfInputSchema } from "@/lib/pdf-to-blocks/schema";
import { pdfToBlocks } from "@/lib/pdf-to-blocks/server";
import { publicProcedure, router } from "./trpc";

export const resumesRouter = router({
  createProjectFromPdf: publicProcedure
    .input(CreateProjectFromPdfInputSchema)
    .mutation(async ({ input }) => {
      const blocks = await pdfToBlocks(input);
      console.log("pdf blocks", blocks);
    }),
});
