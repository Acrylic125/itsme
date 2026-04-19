import db from "@/db/db";
import {
  DocumentDefinitionSchema,
  type DocumentDefinition,
} from "@/blocks/schema";
import { SAMPLE_RESUME } from "@/blocks/renderer-utils";
import { documents, projectMasterDocuments, projects } from "@/db/schema";
import { publicProcedure, router } from "./trpc";
import { z } from "zod";
import { blockInsertionPipeline } from "@/blocks/insertion-pipeline";
import { createPrefixedId, createProjectId } from "@/blocks/insertion-utils";

const USER_ID = "USER";

export const resumesRouter = router({
  createProject: publicProcedure
    .input(
      z.object({
        resume: DocumentDefinitionSchema,
      })
    )
    .mutation(async ({ input }) => {
      const projectId = createProjectId();
      const documentId = createPrefixedId("d_");
      const resumeDocument: DocumentDefinition = input.resume ?? SAMPLE_RESUME;

      await db.insert(projects).values({
        id: projectId,
        name: `${resumeDocument.name} Project`,
        userId: USER_ID,
      });

      await db.insert(documents).values({
        id: documentId,
        name: resumeDocument.name,
        projectId,
      });

      await db.insert(projectMasterDocuments).values({
        projectId,
        documentId,
      });

      await blockInsertionPipeline({
        documentId,
        document: { blocks: resumeDocument.blocks },
      });

      return {
        projectId,
      };
    }),
});
