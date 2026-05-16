import { BlockSchema, DEFAULT_STYLE_SHEET, type Block } from "@/blocks/blocks";
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
import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { publicProcedure, router } from "./trpc";
import { BatchItem } from "drizzle-orm/batch";
import {
  getProjectDocuments,
  getProjectMasterDocument,
} from "./project-documents";

const USER_ID = "USER";
const CLIENT_ID_PREFIX = "CLIENT_ID:" as const;

function isClientId(id: string): boolean {
  return id.startsWith(CLIENT_ID_PREFIX);
}

function createProjectId() {
  return `p_${nanoid(22)}`;
}

function createDocumentId() {
  return `d_${nanoid(22)}`;
}

function createBlockId() {
  return `b_${nanoid(22)}`;
}

function remapBlockIdsInBlock(args: {
  block: Block;
  idMap: Map<string, string>;
}): Block {
  const remap = (id: string) => args.idMap.get(id) ?? id;
  const id = remap(args.block.id);
  const ref = args.block.ref ? remap(args.block.ref) : undefined;

  switch (args.block.type) {
    case "text":
    case "spacer":
      return { ...args.block, id, ...(ref ? { ref } : {}) };
    case "section":
    case "list":
      return {
        ...args.block,
        id,
        blocks: args.block.blocks.map((childId) => remap(childId)),
        ...(ref ? { ref } : {}),
      };
    case "columns":
      return {
        ...args.block,
        id,
        blocks: args.block.blocks.map((child) => ({
          ...child,
          blockId: remap(child.blockId),
        })),
        ...(ref ? { ref } : {}),
      };
  }
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
    case "spacer":
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

const UpdateDocumentBlockActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("update"),
    block: BlockSchema,
  }),
  z.object({
    type: z.literal("create"),
    block: BlockSchema,
  }),
  z.object({
    type: z.literal("delete"),
    blockId: z.string(),
  }),
]);

const UpdateDocumentBlocksInputSchema = z.object({
  blocks: z.array(UpdateDocumentBlockActionSchema),
});

export const resumesRouter = router({
  getProjectDocuments: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const [projectDocuments, masterDocument] = await Promise.all([
        getProjectDocuments(input.projectId),
        getProjectMasterDocument(input.projectId),
      ]);
      return {
        documents: projectDocuments,
        masterDocumentId: masterDocument?.id ?? null,
      };
    }),
  duplicateResume: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        documentId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const [
        sourceDocumentRows,
        sourcePageStyleRows,
        sourceTextStyles,
        sourceListStyleRows,
        sourceMainLayout,
        sourceBlocks,
        sourceTextBlocks,
        sourceSectionBlocks,
        sourceColumnsBlocks,
        sourceListBlocks,
      ] = await db.batch([
        db
          .select({
            id: documents.id,
            name: documents.name,
            projectId: documents.projectId,
          })
          .from(documents)
          .where(
            and(
              eq(documents.id, input.documentId),
              eq(documents.projectId, input.projectId)
            )
          )
          .limit(1),
        db
          .select({
            gap: documentPageStyles.gap,
            marginTop: documentPageStyles.marginTop,
            marginBottom: documentPageStyles.marginBottom,
            marginLeft: documentPageStyles.marginLeft,
            marginRight: documentPageStyles.marginRight,
          })
          .from(documentPageStyles)
          .where(eq(documentPageStyles.documentId, input.documentId))
          .limit(1),
        db
          .select({
            style: documentTextStyles.style,
            fontSize: documentTextStyles.fontSize,
            fontWeight: documentTextStyles.fontWeight,
            fontFamily: documentTextStyles.fontFamily,
            lineHeight: documentTextStyles.lineHeight,
          })
          .from(documentTextStyles)
          .where(eq(documentTextStyles.documentId, input.documentId)),
        db
          .select({
            leftSpace: documentListStyles.leftSpace,
            rightSpace: documentListStyles.rightSpace,
          })
          .from(documentListStyles)
          .where(eq(documentListStyles.documentId, input.documentId))
          .limit(1),
        db
          .select({
            blockId: documentMainLayout.blockId,
            orderIndex: documentMainLayout.orderIndex,
          })
          .from(documentMainLayout)
          .where(eq(documentMainLayout.documentId, input.documentId)),
        db
          .select({
            id: blocks.id,
            type: blocks.type,
            orderIndex: blocks.orderIndex,
          })
          .from(blocks)
          .where(eq(blocks.documentId, input.documentId)),
        db
          .select({
            blockId: textBlocks.blockId,
            text: textBlocks.text,
            align: textBlocks.align,
            style: textBlocks.style,
            ref: textBlocks.ref,
          })
          .from(textBlocks)
          .innerJoin(blocks, eq(textBlocks.blockId, blocks.id))
          .where(eq(blocks.documentId, input.documentId)),
        db
          .select({
            blockId: sectionBlocks.blockId,
            ref: sectionBlocks.ref,
          })
          .from(sectionBlocks)
          .innerJoin(blocks, eq(sectionBlocks.blockId, blocks.id))
          .where(eq(blocks.documentId, input.documentId)),
        db
          .select({
            blockId: columnsBlocks.blockId,
            ref: columnsBlocks.ref,
          })
          .from(columnsBlocks)
          .innerJoin(blocks, eq(columnsBlocks.blockId, blocks.id))
          .where(eq(blocks.documentId, input.documentId)),
        db
          .select({
            blockId: listBlocks.blockId,
            bulletType: listBlocks.bulletType,
            bulletValue: listBlocks.bulletValue,
            leftSpace: listBlocks.leftSpace,
            rightSpace: listBlocks.rightSpace,
            ref: listBlocks.ref,
          })
          .from(listBlocks)
          .innerJoin(blocks, eq(listBlocks.blockId, blocks.id))
          .where(eq(blocks.documentId, input.documentId)),
      ]);

      const sourceDocument = sourceDocumentRows[0];
      if (!sourceDocument) {
        throw new Error("Document not found.");
      }

      const sourcePageStyle = sourcePageStyleRows[0];
      const sourceListStyle = sourceListStyleRows[0];

      const sourceBlockIds = sourceBlocks.map((row) => row.id);

      const sourceSectionBlockIds = sourceSectionBlocks.map(
        (row) => row.blockId
      );
      const sourceColumnsBlockIds = sourceColumnsBlocks.map(
        (row) => row.blockId
      );
      const sourceListBlockIds = sourceListBlocks.map((row) => row.blockId);

      const sourceSectionChildren =
        sourceSectionBlockIds.length === 0
          ? []
          : await db
              .select({
                sectionBlockId: sectionBlockChildren.sectionBlockId,
                childBlockId: sectionBlockChildren.childBlockId,
                orderIndex: sectionBlockChildren.orderIndex,
              })
              .from(sectionBlockChildren)
              .where(
                inArray(
                  sectionBlockChildren.sectionBlockId,
                  sourceSectionBlockIds
                )
              );
      const sourceColumnsChildren =
        sourceColumnsBlockIds.length === 0
          ? []
          : await db
              .select({
                columnsBlockId: columnsBlockChildren.columnsBlockId,
                childBlockId: columnsBlockChildren.childBlockId,
                span: columnsBlockChildren.span,
                orderIndex: columnsBlockChildren.orderIndex,
              })
              .from(columnsBlockChildren)
              .where(
                inArray(
                  columnsBlockChildren.columnsBlockId,
                  sourceColumnsBlockIds
                )
              );
      const sourceListChildren =
        sourceListBlockIds.length === 0
          ? []
          : await db
              .select({
                listBlockId: listBlockChildren.listBlockId,
                childBlockId: listBlockChildren.childBlockId,
                orderIndex: listBlockChildren.orderIndex,
              })
              .from(listBlockChildren)
              .where(
                inArray(listBlockChildren.listBlockId, sourceListBlockIds)
              );

      const duplicatedDocumentId = createDocumentId();
      const duplicatedDocumentName = `${sourceDocument.name} Copy`;

      const duplicatedBlockIdBySourceId = new Map<string, string>();
      for (const sourceBlockId of sourceBlockIds) {
        duplicatedBlockIdBySourceId.set(sourceBlockId, createBlockId());
      }

      const duplicatedBlockId = (sourceBlockId: string) => {
        const nextId = duplicatedBlockIdBySourceId.get(sourceBlockId);
        if (!nextId) {
          throw new Error(
            `Could not find duplicated block id for source block '${sourceBlockId}'.`
          );
        }
        return nextId;
      };

      const statements: BatchItem<"sqlite">[] = [
        db.insert(documents).values({
          id: duplicatedDocumentId,
          name: duplicatedDocumentName,
          projectId: input.projectId,
        }),
      ];

      if (sourcePageStyle) {
        statements.push(
          db.insert(documentPageStyles).values({
            documentId: duplicatedDocumentId,
            gap: sourcePageStyle.gap,
            marginTop: sourcePageStyle.marginTop,
            marginBottom: sourcePageStyle.marginBottom,
            marginLeft: sourcePageStyle.marginLeft,
            marginRight: sourcePageStyle.marginRight,
          })
        );
      }

      if (sourceTextStyles.length > 0) {
        for (const batch of splitInsert(
          sourceTextStyles.map((row) => ({
            documentId: duplicatedDocumentId,
            style: row.style,
            fontSize: row.fontSize,
            fontWeight: row.fontWeight,
            fontFamily: row.fontFamily,
            lineHeight: row.lineHeight,
          }))
        )) {
          statements.push(db.insert(documentTextStyles).values(batch));
        }
      }

      if (sourceListStyle) {
        statements.push(
          db.insert(documentListStyles).values({
            documentId: duplicatedDocumentId,
            leftSpace: sourceListStyle.leftSpace,
            rightSpace: sourceListStyle.rightSpace,
          })
        );
      }

      if (sourceBlocks.length > 0) {
        for (const batch of splitInsert(
          sourceBlocks.map((row) => ({
            id: duplicatedBlockId(row.id),
            documentId: duplicatedDocumentId,
            type: row.type,
            orderIndex: row.orderIndex,
          }))
        )) {
          statements.push(db.insert(blocks).values(batch));
        }
      }

      if (sourceTextBlocks.length > 0) {
        for (const batch of splitInsert(
          sourceTextBlocks.map((row) => ({
            blockId: duplicatedBlockId(row.blockId),
            text: row.text,
            align: row.align,
            style: row.style,
            ref: row.ref,
          }))
        )) {
          statements.push(db.insert(textBlocks).values(batch));
        }
      }

      if (sourceSectionBlocks.length > 0) {
        for (const batch of splitInsert(
          sourceSectionBlocks.map((row) => ({
            blockId: duplicatedBlockId(row.blockId),
            ref: row.ref,
          }))
        )) {
          statements.push(db.insert(sectionBlocks).values(batch));
        }
      }

      if (sourceColumnsBlocks.length > 0) {
        for (const batch of splitInsert(
          sourceColumnsBlocks.map((row) => ({
            blockId: duplicatedBlockId(row.blockId),
            ref: row.ref,
          }))
        )) {
          statements.push(db.insert(columnsBlocks).values(batch));
        }
      }

      if (sourceListBlocks.length > 0) {
        for (const batch of splitInsert(
          sourceListBlocks.map((row) => ({
            blockId: duplicatedBlockId(row.blockId),
            bulletType: row.bulletType,
            bulletValue: row.bulletValue,
            leftSpace: row.leftSpace,
            rightSpace: row.rightSpace,
            ref: row.ref,
          }))
        )) {
          statements.push(db.insert(listBlocks).values(batch));
        }
      }

      if (sourceSectionChildren.length > 0) {
        for (const batch of splitInsert(
          sourceSectionChildren.map((row) => ({
            sectionBlockId: duplicatedBlockId(row.sectionBlockId),
            childBlockId: duplicatedBlockId(row.childBlockId),
            orderIndex: row.orderIndex,
          }))
        )) {
          statements.push(db.insert(sectionBlockChildren).values(batch));
        }
      }

      if (sourceColumnsChildren.length > 0) {
        for (const batch of splitInsert(
          sourceColumnsChildren.map((row) => ({
            columnsBlockId: duplicatedBlockId(row.columnsBlockId),
            childBlockId: duplicatedBlockId(row.childBlockId),
            span: row.span,
            orderIndex: row.orderIndex,
          }))
        )) {
          statements.push(db.insert(columnsBlockChildren).values(batch));
        }
      }

      if (sourceListChildren.length > 0) {
        for (const batch of splitInsert(
          sourceListChildren.map((row) => ({
            listBlockId: duplicatedBlockId(row.listBlockId),
            childBlockId: duplicatedBlockId(row.childBlockId),
            orderIndex: row.orderIndex,
          }))
        )) {
          statements.push(db.insert(listBlockChildren).values(batch));
        }
      }

      if (sourceMainLayout.length > 0) {
        for (const batch of splitInsert(
          sourceMainLayout.map((row) => ({
            documentId: duplicatedDocumentId,
            blockId: duplicatedBlockId(row.blockId),
            orderIndex: row.orderIndex,
          }))
        )) {
          statements.push(db.insert(documentMainLayout).values(batch));
        }
      }

      await db.batch([statements[0], ...statements.slice(1)]);

      return {
        documentId: duplicatedDocumentId,
        documentName: duplicatedDocumentName,
      };
    }),
  deleteResume: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        documentId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const sourceDocument = await db
        .select({
          id: documents.id,
          projectId: documents.projectId,
        })
        .from(documents)
        .where(
          and(
            eq(documents.id, input.documentId),
            eq(documents.projectId, input.projectId)
          )
        )
        .get();

      if (!sourceDocument) {
        throw new Error("Document not found.");
      }

      const masterDocument = await db
        .select({
          documentId: projectMasterDocuments.documentId,
        })
        .from(projectMasterDocuments)
        .where(eq(projectMasterDocuments.projectId, input.projectId))
        .get();

      if (masterDocument?.documentId === input.documentId) {
        throw new Error("Master resume cannot be deleted.");
      }

      await db.delete(documents).where(eq(documents.id, input.documentId));

      const fallbackDocument = await db
        .select({
          id: documents.id,
        })
        .from(documents)
        .where(eq(documents.projectId, input.projectId))
        .orderBy(asc(documents.name))
        .limit(1);

      return {
        deletedDocumentId: input.documentId,
        nextDocumentId: fallbackDocument[0]?.id ?? null,
      };
    }),
  updateDocumentBlocks: publicProcedure
    .input(UpdateDocumentBlocksInputSchema)
    .mutation(async ({ input }) => {
      if (input.blocks.length === 0) {
        return { created: 0, updated: 0, deleted: 0, clientIdToBlockId: {} };
      }

      // Build a mapping for any CLIENT_ID:* blocks in this request.
      // We generate real ids server-side and return the mapping to the client so
      // subsequent requests can reconcile optimistic client ids.
      const clientIdToBlockId = new Map<string, string>();
      for (const action of input.blocks) {
        if (action.type === "delete") continue;
        const maybeClientId = action.block.id;
        if (isClientId(maybeClientId) && !clientIdToBlockId.has(maybeClientId)) {
          clientIdToBlockId.set(maybeClientId, createBlockId());
        }
      }

      const upserts = input.blocks.filter(
        (
          action
        ): action is Extract<
          z.infer<typeof UpdateDocumentBlockActionSchema>,
          { type: "create" | "update" }
        > => action.type === "create" || action.type === "update"
      );
      const deleteIds = input.blocks
        .filter(
          (
            action
          ): action is Extract<
            z.infer<typeof UpdateDocumentBlockActionSchema>,
            { type: "delete" }
          > => action.type === "delete"
        )
        .map((action) => clientIdToBlockId.get(action.blockId) ?? action.blockId);

      // Remap ids inside blocks now that we have the mapping.
      const remappedUpserts = upserts.map((action) => {
        const remappedBlock = remapBlockIdsInBlock({
          block: action.block,
          idMap: clientIdToBlockId,
        });

        // If the client sent an update for a CLIENT_ID block, treat it as a create.
        if (action.type === "update" && isClientId(action.block.id)) {
          return { type: "create" as const, block: remappedBlock };
        }
        return { ...action, block: remappedBlock } as typeof action;
      });

      const touchedBlockIds = [
        ...remappedUpserts.map((action) => action.block.id),
        ...deleteIds,
      ].filter((id) => !isClientId(id));

      const existingRows =
        touchedBlockIds.length === 0
          ? []
          : await db
              .select({
                id: blocks.id,
                documentId: blocks.documentId,
                orderIndex: blocks.orderIndex,
              })
              .from(blocks)
              .where(inArray(blocks.id, touchedBlockIds));

      const existingById = new Map(existingRows.map((row) => [row.id, row]));
      const documentIds = new Set(existingRows.map((row) => row.documentId));
      if (documentIds.size > 1) {
        throw new Error(
          "updateDocumentBlocks only supports mutations within one document."
        );
      }
      const inferredDocumentId = existingRows[0]?.documentId ?? null;

      const hasCreate = remappedUpserts.some((action) => action.type === "create");
      if (hasCreate && !inferredDocumentId) {
        throw new Error(
          "Could not infer documentId for create actions. Include at least one existing block action in the same request."
        );
      }

      for (const action of remappedUpserts) {
        if (action.type === "update" && !existingById.has(action.block.id)) {
          throw new Error(
            `Cannot update missing block '${action.block.id}'. Use type='create' instead.`
          );
        }
      }

      let nextOrderIndex =
        existingRows.reduce(
          (maxOrderIndex, row) => Math.max(maxOrderIndex, row.orderIndex),
          -1
        ) + 1;

      const createActions = remappedUpserts.filter(
        (
          action
        ): action is Extract<
          z.infer<typeof UpdateDocumentBlockActionSchema>,
          { type: "create" }
        > => action.type === "create"
      );
      const updateActions = remappedUpserts.filter(
        (
          action
        ): action is Extract<
          z.infer<typeof UpdateDocumentBlockActionSchema>,
          { type: "update" }
        > => action.type === "update"
      );

      const createBlockRows = createActions.map((action) => {
        const existing = existingById.get(action.block.id);
        const documentId = existing?.documentId ?? inferredDocumentId;
        if (!documentId) {
          throw new Error(
            `Could not resolve documentId for block '${action.block.id}'.`
          );
        }
        const orderIndex = existing?.orderIndex ?? nextOrderIndex++;
        return {
          id: action.block.id,
          documentId,
          type: action.block.type,
          orderIndex,
        };
      });

      const statements: BatchItem<"sqlite">[] = [];

      if (deleteIds.length > 0) {
        statements.push(db.delete(blocks).where(inArray(blocks.id, deleteIds)));
      }

      for (const action of updateActions) {
        statements.push(
          db
            .update(blocks)
            .set({
              type: action.block.type,
            })
            .where(eq(blocks.id, action.block.id))
        );
      }
      for (const batch of splitInsert(createBlockRows)) {
        statements.push(db.insert(blocks).values(batch));
      }

      const blocksToPersist = remappedUpserts.map((action) => action.block);
      const blocksToPersistIds = blocksToPersist.map((block) => block.id);

      if (blocksToPersistIds.length > 0) {
        statements.push(
          db
            .delete(textBlocks)
            .where(inArray(textBlocks.blockId, blocksToPersistIds))
        );
        statements.push(
          db
            .delete(sectionBlockChildren)
            .where(
              inArray(sectionBlockChildren.sectionBlockId, blocksToPersistIds)
            )
        );
        statements.push(
          db
            .delete(sectionBlocks)
            .where(inArray(sectionBlocks.blockId, blocksToPersistIds))
        );
        statements.push(
          db
            .delete(columnsBlockChildren)
            .where(
              inArray(columnsBlockChildren.columnsBlockId, blocksToPersistIds)
            )
        );
        statements.push(
          db
            .delete(columnsBlocks)
            .where(inArray(columnsBlocks.blockId, blocksToPersistIds))
        );
        statements.push(
          db
            .delete(listBlockChildren)
            .where(inArray(listBlockChildren.listBlockId, blocksToPersistIds))
        );
        statements.push(
          db
            .delete(listBlocks)
            .where(inArray(listBlocks.blockId, blocksToPersistIds))
        );
      }

      const textRows = blocksToPersist
        .filter((block): block is Extract<Block, { type: "text" }> => {
          return block.type === "text";
        })
        .map((block) => ({
          blockId: block.id,
          text: block.text,
          align: block.align,
          style: block.style,
          ref: block.ref ?? null,
        }));
      for (const batch of splitInsert(textRows)) {
        statements.push(db.insert(textBlocks).values(batch));
      }

      const sectionRows = blocksToPersist
        .filter((block): block is Extract<Block, { type: "section" }> => {
          return block.type === "section";
        })
        .map((block) => ({
          blockId: block.id,
          ref: block.ref ?? null,
        }));
      for (const batch of splitInsert(sectionRows)) {
        statements.push(db.insert(sectionBlocks).values(batch));
      }
      for (const block of blocksToPersist) {
        if (block.type !== "section") {
          continue;
        }
        statements.push(
          db
            .delete(sectionBlockChildren)
            .where(eq(sectionBlockChildren.sectionBlockId, block.id))
        );
        const sectionChildrenRows = block.blocks.map(
          (childBlockId, orderIndex) => ({
            sectionBlockId: block.id,
            childBlockId,
            orderIndex,
          })
        );
        for (const batch of splitInsert(sectionChildrenRows)) {
          statements.push(db.insert(sectionBlockChildren).values(batch));
        }
      }

      const columnsRows = blocksToPersist
        .filter((block): block is Extract<Block, { type: "columns" }> => {
          return block.type === "columns";
        })
        .map((block) => ({
          blockId: block.id,
          ref: block.ref ?? null,
        }));
      for (const batch of splitInsert(columnsRows)) {
        statements.push(db.insert(columnsBlocks).values(batch));
      }
      for (const block of blocksToPersist) {
        if (block.type !== "columns") {
          continue;
        }
        statements.push(
          db
            .delete(columnsBlockChildren)
            .where(eq(columnsBlockChildren.columnsBlockId, block.id))
        );
        const columnsChildrenRows = block.blocks.map((child, orderIndex) => ({
          columnsBlockId: block.id,
          childBlockId: child.blockId,
          span: child.span,
          orderIndex,
        }));
        for (const batch of splitInsert(columnsChildrenRows)) {
          statements.push(db.insert(columnsBlockChildren).values(batch));
        }
      }

      const listRows = blocksToPersist
        .filter((block): block is Extract<Block, { type: "list" }> => {
          return block.type === "list";
        })
        .map((block) => ({
          blockId: block.id,
          bulletType: block.bullet.type,
          bulletValue:
            block.bullet.type === "normal" ? block.bullet.value : null,
          leftSpace: block.leftSpace ?? null,
          rightSpace: block.rightSpace ?? null,
          ref: block.ref ?? null,
        }));
      for (const batch of splitInsert(listRows)) {
        statements.push(db.insert(listBlocks).values(batch));
      }
      for (const block of blocksToPersist) {
        if (block.type !== "list") {
          continue;
        }
        statements.push(
          db
            .delete(listBlockChildren)
            .where(eq(listBlockChildren.listBlockId, block.id))
        );
        const listChildrenRows = block.blocks.map(
          (childBlockId, orderIndex) => ({
            listBlockId: block.id,
            childBlockId,
            orderIndex,
          })
        );
        for (const batch of splitInsert(listChildrenRows)) {
          statements.push(db.insert(listBlockChildren).values(batch));
        }
      }

      if (statements.length > 0) {
        const [firstStatement, ...restStatements] = statements;
        await db.batch([firstStatement, ...restStatements]);
      }

      console.log(
        "input.blocks",
        input.blocks.length,
        remappedUpserts.length,
        deleteIds.length
      );

      const clientIdToBlockIdRecord: Record<string, string> = {};
      for (const [clientId, blockId] of clientIdToBlockId.entries()) {
        clientIdToBlockIdRecord[clientId] = blockId;
      }

      return {
        created: remappedUpserts.filter((action) => action.type === "create")
          .length,
        updated: remappedUpserts.filter((action) => action.type === "update")
          .length,
        deleted: deleteIds.length,
        clientIdToBlockId: clientIdToBlockIdRecord,
      };
    }),
  createProjectFromPdf: publicProcedure
    .input(CreateProjectFromPdfInputSchema)
    .mutation(async ({ input: unvalidatedInput }) => {
      // Validate input
      const input = CreateProjectFromPdfInputSchema.parse(unvalidatedInput);
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
