import db from "@/db/db";
import {
  DocumentDefinitionSchema,
  SAMPLE_RESUME,
  type Block,
  type BlockWithSection,
} from "@/components/document-blocks";
import {
  aboutBlockPoints,
  aboutBlocks,
  blocks,
  bulletListBlocks,
  bulletListPoints,
  documents,
  points,
  projectMasterDocuments,
  projects,
  sectionBlockChildren,
  sectionBlocks,
  twoColumnListBlocks,
  twoColumnListRows,
  vSpacerBlocks,
} from "@/db/schema";
import { publicProcedure, router } from "./trpc";
import { z } from "zod";

const USER_ID = "USER";

function createPrefixedId(prefix: "d_" | "b_" | "p_"): string {
  const targetLength = 24;
  const suffixLength = targetLength - prefix.length;
  const random = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}${random.slice(0, suffixLength)}`;
}

function createProjectId(): string {
  const prefix = "pr_";
  const targetLength = 24;
  const suffixLength = targetLength - prefix.length;
  const random = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}${random.slice(0, suffixLength)}`;
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

        if (block.type === "about") {
          await db.insert(aboutBlocks).values({
            blockId,
            header: block.header,
          });
          const pointIds = await insertPointChain(block.points);
          if (pointIds.length > 0) {
            await db.insert(aboutBlockPoints).values(
              pointIds.map((pointId, index) => ({
                blockId,
                pointId,
                orderIndex: index,
              }))
            );
          }
          return blockId;
        }

        if (block.type === "bullet-list") {
          await db.insert(bulletListBlocks).values({
            blockId,
            headerLeftContent: block.header?.[0] ?? null,
            headerRightContent: block.header?.[1] ?? null,
          });
          const pointIds = await insertPointChain(block.points);
          if (pointIds.length > 0) {
            await db.insert(bulletListPoints).values(
              pointIds.map((pointId, index) => ({
                blockId,
                pointId,
                orderIndex: index,
              }))
            );
          }
          return blockId;
        }

        if (block.type === "2-column-list") {
          await db.insert(twoColumnListBlocks).values({
            blockId,
            headerLeftContent: block.header?.[0] ?? null,
            headerRightContent: block.header?.[1] ?? null,
          });

          const rowValues: Array<{
            blockId: string;
            leftPointId: string;
            rightPointId: string;
            orderIndex: number;
          }> = [];

          for (let index = 0; index < block.points.length; index += 1) {
            const [left, right] = block.points[index];
            const leftPointId = createPrefixedId("p_");
            const rightPointId = createPrefixedId("p_");
            await db.insert(points).values([
              { id: leftPointId, content: left.slice(0, 512), refPointId: null },
              {
                id: rightPointId,
                content: right.slice(0, 512),
                refPointId: leftPointId,
              },
            ]);
            rowValues.push({
              blockId,
              leftPointId,
              rightPointId,
              orderIndex: index,
            });
          }

          if (rowValues.length > 0) {
            await db.insert(twoColumnListRows).values(rowValues);
          }
          return blockId;
        }

        if (block.type === "v-spacer") {
          await db.insert(vSpacerBlocks).values({
            blockId,
            height: Math.round(block.height),
          });
          return blockId;
        }

        await db.insert(sectionBlocks).values({
          blockId,
          headerLeftContent: block.header[0],
          headerRightContent: block.header[1],
        });

        for (let index = 0; index < block.blocks.length; index += 1) {
          const childBlock = block.blocks[index] as Block;
          const childBlockId = await insertBlock(childBlock);
          await db.insert(sectionBlockChildren).values({
            sectionBlockId: blockId,
            childBlockId,
            orderIndex: index,
          });
        }
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
