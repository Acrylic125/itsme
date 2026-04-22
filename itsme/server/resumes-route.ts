import { insertBlocksForDocument } from "@/blocks/insert-utils";
import db from "@/db/db";
import {
  documentListStyles,
  documentPageStyles,
  documents,
  documentTextStyles,
  projectMasterDocuments,
  projects,
} from "@/db/schema";
import { CreateProjectFromPdfInputSchema } from "@/lib/pdf-to-blocks/schema";
import { pdfToBlocks } from "@/lib/pdf-to-blocks/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { publicProcedure, router } from "./trpc";

const USER_ID = "USER";

function createProjectId() {
  return `p_${nanoid(22)}`;
}

function createDocumentId() {
  return `d_${nanoid(22)}`;
}

function getProjectNameFromBlocks(
  blocks: Awaited<ReturnType<typeof pdfToBlocks>>
) {
  const titleBlock = blocks.find(
    (
      block
    ): block is Extract<
      Awaited<ReturnType<typeof pdfToBlocks>>[number],
      { type: "text" }
    > => block.type === "text" && block.style === "h1"
  );
  if (!titleBlock) {
    return "Imported Resume";
  }

  return titleBlock.text.slice(0, 80) || "Imported Resume";
}

async function insertDefaultDocumentStyles(documentId: string) {
  await db.insert(documentPageStyles).values({
    documentId,
    gap: 0.3,
    marginTop: 0.3,
    marginBottom: 0.3,
    marginLeft: 0.3,
    marginRight: 0.3,
  });

  await db.insert(documentTextStyles).values([
    {
      documentId,
      style: "default",
      fontSize: 11,
      fontWeight: "normal",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
    {
      documentId,
      style: "h1",
      fontSize: 16,
      fontWeight: "normal",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
    {
      documentId,
      style: "h2",
      fontSize: 14,
      fontWeight: "bold",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
    {
      documentId,
      style: "h3",
      fontSize: 12,
      fontWeight: "bold",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
  ]);

  await db.insert(documentListStyles).values({
    documentId,
    leftSpace: 0.35,
    rightSpace: 0.12,
  });
}

export const resumesRouter = router({
  createProjectFromPdf: publicProcedure
    .input(CreateProjectFromPdfInputSchema)
    .mutation(async ({ input }) => {
      const blocks = await pdfToBlocks(input);
      const projectId = createProjectId();
      const documentId = createDocumentId();
      const projectName = getProjectNameFromBlocks(blocks);
      const documentName = "Master Resume";

      try {
        await db.insert(projects).values({
          id: projectId,
          name: projectName,
          userId: USER_ID,
        });

        await db.insert(documents).values({
          id: documentId,
          name: documentName,
          projectId,
        });

        await db.insert(projectMasterDocuments).values({
          projectId,
          documentId,
        });

        await insertDefaultDocumentStyles(documentId);
        await insertBlocksForDocument({
          documentId,
          blocks,
        });

        return {
          projectId,
          documentId,
          blockCount: blocks.length,
        };
      } catch (error) {
        await db.delete(projects).where(eq(projects.id, projectId));
        throw error;
      }
    }),
});
