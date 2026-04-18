import db from "@/db/db";
import {
  DocumentDefinitionSchema,
  SAMPLE_RESUME,
  type Block,
  type BlockWithSection,
} from "@/components/document-blocks";
import { blocks, documents, points, projectMasterDocuments, projects } from "@/db/schema";
import { publicProcedure, router } from "./trpc";
import { z } from "zod";
import { BLOCK_INSERT_CODECS } from "@/blocks/codec-registry";
import { nanoid } from "nanoid";

const USER_ID = "USER";

function createPrefixedId(prefix: "d_" | "b_" | "p_"): string {
  const targetLength = 24;
  const suffixLength = targetLength - prefix.length;
  return `${prefix}${nanoid(suffixLength)}`;
}

function createProjectId(): string {
  const prefix = "pr_";
  const targetLength = 24;
  const suffixLength = targetLength - prefix.length;
  return `${prefix}${nanoid(suffixLength)}`;
}

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
      const resumeDocument = input.resume ?? SAMPLE_RESUME;

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

      let blockOrderIndex = 0;

      const insertPointChain = async (values: string[]) => {
        if (values.length === 0) return [] as string[];
        const pointIds = values.map(() => createPrefixedId("p_"));
        await db.insert(points).values(
          values.map((content, index) => ({
            id: pointIds[index],
            content: content.slice(0, 512),
            refPointId: index === 0 ? null : pointIds[index - 1],
          }))
        );
        return pointIds;
      };

      const insertBlock = async (block: BlockWithSection): Promise<string> => {
        const blockId = createPrefixedId("b_");
        await db.insert(blocks).values({
          id: blockId,
          documentId,
          type: block.type,
          orderIndex: blockOrderIndex,
        });
        blockOrderIndex += 1;

        const codec = BLOCK_INSERT_CODECS[block.type] as (args: {
          blockId: string;
          block: BlockWithSection;
          helpers: {
            insertPointChain: (values: string[]) => Promise<string[]>;
            createPrefixedId: (prefix: "p_") => string;
            insertBlock: (childBlock: Block) => Promise<string>;
          };
        }) => Promise<void>;
        await codec({
          blockId,
          block,
          helpers: {
            insertPointChain,
            createPrefixedId: (prefix) => createPrefixedId(prefix),
            insertBlock: async (childBlock) => insertBlock(childBlock),
          },
        });

        return blockId;
      };

      for (const block of resumeDocument.blocks) {
        await insertBlock(block);
      }

      return {
        projectId,
      };
    }),
});
