import db from "@/db/db";
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
import {
  DocumentDefinitionSchema,
  type BlockWithSection,
  type DocumentDefinition,
} from "@/components/document-blocks";
import { and, asc, eq, inArray } from "drizzle-orm";
import { BLOCK_DECODE_CODECS } from "@/blocks/codec-registry";
import type { DecodeBlockMaps } from "@/blocks/server-codec-types";

function createEmptyDocument(name: string): DocumentDefinition {
  return {
    name,
    pageSize: { width: 8.5, height: 11 },
    font: "Times New Roman",
    spacingBelow: {
      about: 11,
      "bullet-list": 11,
      "2-column-list": 11,
      section: 11,
      "v-spacer": 0,
    },
    margins: {
      top: 24,
      bottom: 24,
      left: 24,
      right: 24,
    },
    textStyles: {
      default: { fontSize: 11, fontWeight: "normal", lineHeight: 1.2 },
      h1: { fontSize: 16, fontWeight: "normal", lineHeight: 1.2 },
      h2: { fontSize: 14, fontWeight: "bold", lineHeight: 1.2 },
      h3: { fontSize: 12, fontWeight: "bold", lineHeight: 1.2 },
      h4: { fontSize: 11, fontWeight: "bold", lineHeight: 1.2 },
    },
    bulletListStyle: {
      bullet: "•",
      indent: 11,
      gap: 11,
    },
    blocks: [],
  };
}

export async function getProjectById(projectId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      userId: projects.userId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
}

export async function getProjectMasterDocument(projectId: string) {
  const masterRows = await db
    .select({
      id: documents.id,
      name: documents.name,
    })
    .from(projectMasterDocuments)
    .innerJoin(documents, eq(projectMasterDocuments.documentId, documents.id))
    .where(eq(projectMasterDocuments.projectId, projectId))
    .limit(1);

  return masterRows[0] ?? null;
}

export async function getProjectDocuments(projectId: string) {
  return db
    .select({
      id: documents.id,
      name: documents.name,
    })
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(asc(documents.name));
}

async function getDocumentDefinitionById(
  documentId: string,
  name: string
): Promise<DocumentDefinition> {
  const documentBlocks = await db
    .select({
      id: blocks.id,
      type: blocks.type,
      orderIndex: blocks.orderIndex,
    })
    .from(blocks)
    .where(eq(blocks.documentId, documentId))
    .orderBy(asc(blocks.orderIndex));

  const blockIds = documentBlocks.map((block) => block.id);
  const emptyDocument = createEmptyDocument(name);
  let reconstructedDocument = emptyDocument;

  if (blockIds.length > 0) {
    const [
      aboutRows,
      aboutPointRows,
      bulletRows,
      bulletPointRows,
      twoColumnRows,
      twoColumnPointRows,
      spacerRows,
      sectionRows,
      sectionChildRows,
    ] = await Promise.all([
      db
        .select({
          blockId: aboutBlocks.blockId,
          header: aboutBlocks.header,
        })
        .from(aboutBlocks)
        .where(inArray(aboutBlocks.blockId, blockIds)),
      db
        .select({
          blockId: aboutBlockPoints.blockId,
          pointId: aboutBlockPoints.pointId,
          orderIndex: aboutBlockPoints.orderIndex,
          content: points.content,
        })
        .from(aboutBlockPoints)
        .innerJoin(points, eq(aboutBlockPoints.pointId, points.id))
        .where(inArray(aboutBlockPoints.blockId, blockIds)),
      db
        .select({
          blockId: bulletListBlocks.blockId,
          headerLeftContent: bulletListBlocks.headerLeftContent,
          headerRightContent: bulletListBlocks.headerRightContent,
        })
        .from(bulletListBlocks)
        .where(inArray(bulletListBlocks.blockId, blockIds)),
      db
        .select({
          blockId: bulletListPoints.blockId,
          pointId: bulletListPoints.pointId,
          orderIndex: bulletListPoints.orderIndex,
          content: points.content,
        })
        .from(bulletListPoints)
        .innerJoin(points, eq(bulletListPoints.pointId, points.id))
        .where(inArray(bulletListPoints.blockId, blockIds)),
      db
        .select({
          blockId: twoColumnListBlocks.blockId,
          headerLeftContent: twoColumnListBlocks.headerLeftContent,
          headerRightContent: twoColumnListBlocks.headerRightContent,
        })
        .from(twoColumnListBlocks)
        .where(inArray(twoColumnListBlocks.blockId, blockIds)),
      db
        .select({
          blockId: twoColumnListRows.blockId,
          orderIndex: twoColumnListRows.orderIndex,
          leftPointId: twoColumnListRows.leftPointId,
          rightPointId: twoColumnListRows.rightPointId,
        })
        .from(twoColumnListRows)
        .where(inArray(twoColumnListRows.blockId, blockIds)),
      db
        .select({
          blockId: vSpacerBlocks.blockId,
          height: vSpacerBlocks.height,
        })
        .from(vSpacerBlocks)
        .where(inArray(vSpacerBlocks.blockId, blockIds)),
      db
        .select({
          blockId: sectionBlocks.blockId,
          headerLeftContent: sectionBlocks.headerLeftContent,
          headerRightContent: sectionBlocks.headerRightContent,
        })
        .from(sectionBlocks)
        .where(inArray(sectionBlocks.blockId, blockIds)),
      db
        .select({
          sectionBlockId: sectionBlockChildren.sectionBlockId,
          childBlockId: sectionBlockChildren.childBlockId,
          orderIndex: sectionBlockChildren.orderIndex,
        })
        .from(sectionBlockChildren)
        .where(inArray(sectionBlockChildren.sectionBlockId, blockIds)),
    ]);

    const pointIds = Array.from(
      new Set(
        twoColumnPointRows.flatMap((row) => [row.leftPointId, row.rightPointId])
      )
    );
    const twoColumnContentRows =
      pointIds.length > 0
        ? await db
            .select({
              id: points.id,
              content: points.content,
            })
            .from(points)
            .where(inArray(points.id, pointIds))
        : [];
    const pointContentById = new Map(
      twoColumnContentRows.map((row) => [row.id, row.content])
    );

    const blockRowById = new Map(documentBlocks.map((row) => [row.id, row]));
    const aboutByBlockId = new Map(aboutRows.map((row) => [row.blockId, row]));
    const bulletByBlockId = new Map(
      bulletRows.map((row) => [row.blockId, row])
    );
    const twoColumnByBlockId = new Map(
      twoColumnRows.map((row) => [row.blockId, row])
    );
    const spacerByBlockId = new Map(
      spacerRows.map((row) => [row.blockId, row])
    );
    const sectionByBlockId = new Map(
      sectionRows.map((row) => [row.blockId, row])
    );

    const aboutPointsByBlockId = new Map<string, string[]>();
    for (const row of aboutPointRows.sort(
      (a, b) => a.orderIndex - b.orderIndex
    )) {
      const next = aboutPointsByBlockId.get(row.blockId) ?? [];
      next.push(row.content);
      aboutPointsByBlockId.set(row.blockId, next);
    }

    const bulletPointsByBlockId = new Map<string, string[]>();
    for (const row of bulletPointRows.sort(
      (a, b) => a.orderIndex - b.orderIndex
    )) {
      const next = bulletPointsByBlockId.get(row.blockId) ?? [];
      next.push(row.content);
      bulletPointsByBlockId.set(row.blockId, next);
    }

    const twoColumnPointsByBlockId = new Map<string, [string, string][]>();
    for (const row of twoColumnPointRows.sort(
      (a, b) => a.orderIndex - b.orderIndex
    )) {
      const next = twoColumnPointsByBlockId.get(row.blockId) ?? [];
      next.push([
        pointContentById.get(row.leftPointId) ?? "",
        pointContentById.get(row.rightPointId) ?? "",
      ]);
      twoColumnPointsByBlockId.set(row.blockId, next);
    }

    const sectionChildrenBySectionId = new Map<string, string[]>();
    const sectionChildIdSet = new Set<string>();
    for (const row of sectionChildRows.sort(
      (a, b) => a.orderIndex - b.orderIndex
    )) {
      sectionChildIdSet.add(row.childBlockId);
      const next = sectionChildrenBySectionId.get(row.sectionBlockId) ?? [];
      next.push(row.childBlockId);
      sectionChildrenBySectionId.set(row.sectionBlockId, next);
    }

    const maps: DecodeBlockMaps = {
      aboutByBlockId,
      bulletByBlockId,
      twoColumnByBlockId,
      spacerByBlockId,
      sectionByBlockId,
      aboutPointsByBlockId,
      bulletPointsByBlockId,
      twoColumnPointsByBlockId,
      sectionChildrenBySectionId,
    };

    const buildBlock = (blockId: string): BlockWithSection | null => {
      const row = blockRowById.get(blockId);
      if (!row) return null;

      const codec = BLOCK_DECODE_CODECS[row.type] as (args: {
        blockId: string;
        maps: DecodeBlockMaps;
        helpers: { buildBlock: (id: string) => BlockWithSection | null };
      }) => BlockWithSection | null;

      return codec({
        blockId,
        maps,
        helpers: { buildBlock },
      });
    };

    const topLevelBlocks = documentBlocks
      .filter((row) => !sectionChildIdSet.has(row.id))
      .map((row) => buildBlock(row.id))
      .filter((block): block is BlockWithSection => block != null);

    const candidateDocument: DocumentDefinition = {
      ...emptyDocument,
      blocks: topLevelBlocks,
    };
    const parsedDocument = DocumentDefinitionSchema.safeParse(candidateDocument);
    reconstructedDocument = parsedDocument.success
      ? parsedDocument.data
      : emptyDocument;
  }

  return reconstructedDocument;
}

export async function getProjectDocumentDefinition(args: {
  projectId: string;
  documentId: string;
}) {
  const { projectId, documentId } = args;
  const documentRow = await db
    .select({
      id: documents.id,
      name: documents.name,
    })
    .from(documents)
    .where(
      and(eq(documents.projectId, projectId), eq(documents.id, documentId))
    )
    .get();

  if (!documentRow) {
    return null;
  }

  const definition = await getDocumentDefinitionById(
    documentId,
    documentRow.name
  );
  return {
    id: documentRow.id,
    name: documentRow.name,
    definition,
  };
}
