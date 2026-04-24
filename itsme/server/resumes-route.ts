import { DEFAULT_STYLE_SHEET, type Block } from "@/blocks/blocks";
import db from "@/db/db";
import {
  blocks,
  columnsBlockChildren,
  columnsBlocks,
  documentMainLayout,
  documentListStyles,
  documentPageStyles,
  documents,
  documentTextStyles,
  listBlockChildren,
  listBlocks,
  projectMasterDocuments,
  projects,
  sectionBlockChildren,
  sectionBlocks,
  textBlocks,
} from "@/db/schema";
import { CreateProjectFromPdfInputSchema } from "@/lib/pdf-to-blocks/schema";
import { pdfToBlocks } from "@/lib/pdf-to-blocks/server";
import { splitInsert } from "@/lib/split-insert";
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

function getChildBlockIds(block: Block): string[] {
  switch (block.type) {
    case "text":
      return [];
    case "section":
    case "list":
      return block.blocks;
    case "columns":
      return block.blocks.map((child) => child.blockId);
  }
}

function getMainLayoutBlockIds(blockList: Block[]) {
  const referencedBlockIds = new Set<string>();

  for (const block of blockList) {
    for (const childBlockId of getChildBlockIds(block)) {
      referencedBlockIds.add(childBlockId);
    }
  }

  return blockList
    .map((block) => block.id)
    .filter((blockId) => !referencedBlockIds.has(blockId));
}

export const resumesRouter = router({
  createProjectFromPdf: publicProcedure
    .input(CreateProjectFromPdfInputSchema)
    .mutation(async ({ input }) => {
      const docBlocks = await pdfToBlocks(input);

      const mainLayoutBlockIds = getMainLayoutBlockIds(docBlocks);
      const projectId = createProjectId();
      const documentId = createDocumentId();
      const projectName = getProjectNameFromBlocks(docBlocks);
      const documentName = "Master Resume";

      try {
        const statements: Parameters<typeof db.batch>[0][number][] = [
          db.insert(projects).values({
            id: projectId,
            name: projectName,
            userId: USER_ID,
          }),
          db.insert(documents).values({
            id: documentId,
            name: documentName,
            projectId,
          }),
          db.insert(projectMasterDocuments).values({
            projectId,
            documentId,
          }),
          db.insert(documentPageStyles).values({
            documentId,
            gap: DEFAULT_STYLE_SHEET.page.gap,
            marginTop: DEFAULT_STYLE_SHEET.page.margins.top,
            marginBottom: DEFAULT_STYLE_SHEET.page.margins.bottom,
            marginLeft: DEFAULT_STYLE_SHEET.page.margins.left,
            marginRight: DEFAULT_STYLE_SHEET.page.margins.right,
          }),
          db.insert(documentTextStyles).values([
            {
              documentId,
              style: "default",
              fontSize: DEFAULT_STYLE_SHEET.text.default.fontSize,
              fontWeight: "normal",
              fontFamily: DEFAULT_STYLE_SHEET.text.default.fontFamily,
              lineHeight: DEFAULT_STYLE_SHEET.text.default.lineHeight,
            },
          ]),
          db.insert(documentTextStyles).values([
            {
              documentId,
              style: "h1",
              fontSize: DEFAULT_STYLE_SHEET.text.h1.fontSize,
              fontWeight: "normal",
              fontFamily: DEFAULT_STYLE_SHEET.text.h1.fontFamily,
              lineHeight: DEFAULT_STYLE_SHEET.text.h1.lineHeight,
            },
          ]),
          db.insert(documentTextStyles).values([
            {
              documentId,
              style: "h2",
              fontSize: DEFAULT_STYLE_SHEET.text.h2.fontSize,
              fontWeight: "bold",
              fontFamily: DEFAULT_STYLE_SHEET.text.h2.fontFamily,
              lineHeight: DEFAULT_STYLE_SHEET.text.h2.lineHeight,
            },
          ]),
          db.insert(documentTextStyles).values([
            {
              documentId,
              style: "h3",
              fontSize: DEFAULT_STYLE_SHEET.text.h3.fontSize,
              fontWeight: "bold",
              fontFamily: DEFAULT_STYLE_SHEET.text.h3.fontFamily,
              lineHeight: DEFAULT_STYLE_SHEET.text.h3.lineHeight,
            },
          ]),
          db.insert(documentListStyles).values({
            documentId,
            leftSpace: DEFAULT_STYLE_SHEET.list.leftSpace,
            rightSpace: DEFAULT_STYLE_SHEET.list.rightSpace,
          }),
        ];

        const blockRows = docBlocks.map((block, orderIndex) => ({
          id: block.id,
          documentId,
          type: block.type,
          orderIndex,
        }));
        for (const batch of splitInsert(blockRows)) {
          statements.push(db.insert(blocks).values(batch));
        }

        const textBlockRows = docBlocks
          .filter(
            (block): block is Extract<Block, { type: "text" }> =>
              block.type === "text"
          )
          .map((block) => ({
            blockId: block.id,
            text: block.text,
            align: block.align,
            style: block.style,
            ref: block.ref ?? null,
          }));
        for (const batch of splitInsert(textBlockRows)) {
          statements.push(db.insert(textBlocks).values(batch));
        }

        const sectionBlockRows = docBlocks
          .filter(
            (block): block is Extract<Block, { type: "section" }> =>
              block.type === "section"
          )
          .map((block) => ({
            blockId: block.id,
            ref: block.ref ?? null,
          }));
        for (const batch of splitInsert(sectionBlockRows)) {
          statements.push(db.insert(sectionBlocks).values(batch));
        }

        const sectionBlockChildrenRows = docBlocks
          .filter(
            (block): block is Extract<Block, { type: "section" }> =>
              block.type === "section"
          )
          .flatMap((block) =>
            block.blocks.map((childBlockId, orderIndex) => ({
              sectionBlockId: block.id,
              childBlockId,
              orderIndex,
            }))
          );
        for (const batch of splitInsert(sectionBlockChildrenRows)) {
          statements.push(db.insert(sectionBlockChildren).values(batch));
        }

        const columnsBlockRows = docBlocks
          .filter(
            (block): block is Extract<Block, { type: "columns" }> =>
              block.type === "columns"
          )
          .map((block) => ({
            blockId: block.id,
            ref: block.ref ?? null,
          }));
        for (const batch of splitInsert(columnsBlockRows)) {
          statements.push(db.insert(columnsBlocks).values(batch));
        }

        const columnsBlockChildrenRows = docBlocks
          .filter(
            (block): block is Extract<Block, { type: "columns" }> =>
              block.type === "columns"
          )
          .flatMap((block) =>
            block.blocks.map((child, orderIndex) => ({
              columnsBlockId: block.id,
              childBlockId: child.blockId,
              span: child.span,
              orderIndex,
            }))
          );
        for (const batch of splitInsert(columnsBlockChildrenRows)) {
          statements.push(db.insert(columnsBlockChildren).values(batch));
        }

        const listBlockRows = docBlocks
          .filter(
            (block): block is Extract<Block, { type: "list" }> =>
              block.type === "list"
          )
          .map((block) => ({
            blockId: block.id,
            bulletType: block.bullet.type,
            bulletValue:
              block.bullet.type === "normal" ? block.bullet.value : null,
            leftSpace: block.leftSpace ?? null,
            rightSpace: block.rightSpace ?? null,
            ref: block.ref ?? null,
          }));
        for (const batch of splitInsert(listBlockRows)) {
          statements.push(db.insert(listBlocks).values(batch));
        }

        const listBlockChildrenRows = docBlocks
          .filter(
            (block): block is Extract<Block, { type: "list" }> =>
              block.type === "list"
          )
          .flatMap((block) =>
            block.blocks.map((childBlockId, orderIndex) => ({
              listBlockId: block.id,
              childBlockId,
              orderIndex,
            }))
          );
        for (const batch of splitInsert(listBlockChildrenRows)) {
          statements.push(db.insert(listBlockChildren).values(batch));
        }

        if (mainLayoutBlockIds.length > 0) {
          const mainLayoutRows = mainLayoutBlockIds.map(
            (blockId, orderIndex) => ({
              documentId,
              blockId,
              orderIndex,
            })
          );
          for (const batch of splitInsert(mainLayoutRows)) {
            statements.push(db.insert(documentMainLayout).values(batch));
          }
        }

        await db.batch(
          statements as [
            Parameters<typeof db.batch>[0][number],
            ...Parameters<typeof db.batch>[0][number][],
          ]
        );

        return {
          projectId,
          documentId,
          blockCount: docBlocks.length,
        };
      } catch (error) {
        await db.delete(projects).where(eq(projects.id, projectId));
        throw error;
      }
    }),
});
