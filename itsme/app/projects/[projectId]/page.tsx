import db from "@/db/db";
import { PageCanvas } from "@/components/page-canvas";
import {
  DocumentDefinitionSchema,
  type Block,
  type BlockWithSection,
  type DocumentDefinition,
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
import { asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await db
    .select({
      id: projects.id,
      name: projects.name,
      userId: projects.userId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  if (!project) {
    notFound();
  }

  const _masterDocument = await db
    .select({
      id: documents.id,
      name: documents.name,
    })
    .from(projectMasterDocuments)
    .innerJoin(documents, eq(projectMasterDocuments.documentId, documents.id))
    .where(eq(projectMasterDocuments.projectId, projectId))
    .limit(1);
  const masterDocument = _masterDocument[0];

  if (!masterDocument) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-6 py-10">
        <Link
          href="/projects"
          className="text-sm text-blue-600 hover:underline"
        >
          Back to projects
        </Link>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-zinc-600">
          No master resume is linked to this project yet.
        </p>
      </main>
    );
  }

  const documentBlocks = await db
    .select({
      id: blocks.id,
      type: blocks.type,
      orderIndex: blocks.orderIndex,
    })
    .from(blocks)
    .where(eq(blocks.documentId, masterDocument.id))
    .orderBy(asc(blocks.orderIndex));

  const blockIds = documentBlocks.map((b) => b.id);
  const emptyDocument: DocumentDefinition = {
    name: masterDocument.name,
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

  let reconstructedDocument = emptyDocument;
  console.log(blockIds);

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

    const buildBlock = (blockId: string): BlockWithSection | null => {
      const row = blockRowById.get(blockId);
      if (!row) return null;

      if (row.type === "about") {
        const detail = aboutByBlockId.get(blockId);
        if (!detail) return null;
        return {
          type: "about",
          header: detail.header,
          points: aboutPointsByBlockId.get(blockId) ?? [],
        };
      }

      if (row.type === "bullet-list") {
        const detail = bulletByBlockId.get(blockId);
        if (!detail) return null;
        const hasHeader =
          detail.headerLeftContent != null && detail.headerRightContent != null;
        return {
          type: "bullet-list",
          header: hasHeader
            ? [detail.headerLeftContent!, detail.headerRightContent!]
            : null,
          points: bulletPointsByBlockId.get(blockId) ?? [],
        };
      }

      if (row.type === "2-column-list") {
        const detail = twoColumnByBlockId.get(blockId);
        if (!detail) return null;
        const hasHeader =
          detail.headerLeftContent != null && detail.headerRightContent != null;
        return {
          type: "2-column-list",
          header: hasHeader
            ? [detail.headerLeftContent!, detail.headerRightContent!]
            : null,
          points: twoColumnPointsByBlockId.get(blockId) ?? [],
        };
      }

      if (row.type === "v-spacer") {
        const detail = spacerByBlockId.get(blockId);
        if (!detail) return null;
        return {
          type: "v-spacer",
          height: detail.height,
        };
      }

      const detail = sectionByBlockId.get(blockId);
      if (!detail) return null;
      const children = (sectionChildrenBySectionId.get(blockId) ?? [])
        .map((childId) => buildBlock(childId))
        .filter((b): b is Block => b != null && b.type !== "section");
      return {
        type: "section",
        header: [detail.headerLeftContent, detail.headerRightContent],
        blocks: children,
      };
    };

    const topLevelBlocks = documentBlocks
      .filter((row) => !sectionChildIdSet.has(row.id))
      .map((row) => buildBlock(row.id))
      .filter((block): block is BlockWithSection => block != null);

    const candidateDocument: DocumentDefinition = {
      ...emptyDocument,
      blocks: topLevelBlocks,
    };
    const parsedDocument =
      DocumentDefinitionSchema.safeParse(candidateDocument);
    reconstructedDocument = parsedDocument.success
      ? parsedDocument.data
      : emptyDocument;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <Link href="/projects" className="text-sm text-blue-600 hover:underline">
        Back to projects
      </Link>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-zinc-600">Project ID: {project.id}</p>
        <p className="text-sm text-zinc-600">User ID: {project.userId}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Master Resume</h2>
        <p className="text-sm text-zinc-700">
          {masterDocument.name} ({masterDocument.id})
        </p>
        <div className="w-full max-w-7xl min-h-[900px]">
          <PageCanvas document={reconstructedDocument} dpi={300} />
        </div>
        <div className="rounded-md border border-zinc-200 p-4">
          <p className="mb-2 text-sm font-medium">Blocks</p>
          {documentBlocks.length === 0 ? (
            <p className="text-sm text-zinc-600">No blocks found.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {documentBlocks.map((block) => (
                <li key={block.id}>
                  #{block.orderIndex} - {block.type} ({block.id})
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
