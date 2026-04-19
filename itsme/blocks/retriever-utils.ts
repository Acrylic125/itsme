import db from "@/db/db";
import {
  aboutBlockPoints,
  aboutBlocks,
  blocks,
  bulletListBlocks,
  bulletListPoints,
  points,
  sectionBlockChildren,
  sectionBlocks,
  twoColumnListBlocks,
  twoColumnListRows,
  vSpacerBlocks,
} from "@/db/schema";
import type { BlockWithSection } from "./schema";
import { asc, eq, inArray } from "drizzle-orm";
import { BaseBlock } from "./section/schema";

export async function getDocumentBlockMappings(documentId: string) {
  const blockRows = await db
    .select({
      id: blocks.id,
      type: blocks.type,
      orderIndex: blocks.orderIndex,
    })
    .from(blocks)
    .where(eq(blocks.documentId, documentId))
    .orderBy(asc(blocks.orderIndex));
  return new Map(blockRows.map((row) => [row.id, row]));
}

export async function getBlockMappings(blockIds: string[]) {
  const [
    aboutBlockRows,
    aboutPointRows,
    bulletBlockRows,
    bulletPointRows,
    twoColumnBlockRows,
    twoColumnPointRows,
    spacerBlockRows,
    sectionBlockRows,
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
    (async () => {
      if (blockIds.length === 0) return [];
      const rowList = await db
        .select({
          blockId: twoColumnListRows.blockId,
          orderIndex: twoColumnListRows.orderIndex,
          leftPointId: twoColumnListRows.leftPointId,
          rightPointId: twoColumnListRows.rightPointId,
        })
        .from(twoColumnListRows)
        .where(inArray(twoColumnListRows.blockId, blockIds));
      const pointIdSet = new Set<string>();
      for (const r of rowList) {
        pointIdSet.add(r.leftPointId);
        pointIdSet.add(r.rightPointId);
      }
      const pointIdList = [...pointIdSet];
      const pointRows =
        pointIdList.length === 0
          ? []
          : await db
              .select({
                id: points.id,
                content: points.content,
                refPointId: points.refPointId,
              })
              .from(points)
              .where(inArray(points.id, pointIdList));
      const pointById = new Map(pointRows.map((p) => [p.id, p]));
      return rowList.flatMap((r) => {
        const left = pointById.get(r.leftPointId);
        const right = pointById.get(r.rightPointId);
        if (!left || !right) return [];
        return [
          {
            blockId: r.blockId,
            orderIndex: r.orderIndex,
            leftPointId: r.leftPointId,
            leftContent: left.content,
            leftRefPointId: left.refPointId,
            rightPointId: r.rightPointId,
            rightContent: right.content,
            rightRefPointId: right.refPointId,
          },
        ];
      });
    })(),
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

  return {
    about: {
      blocks: new Map(aboutBlockRows.map((row) => [row.blockId, row])),
      points: aboutPointRows.reduce((acc, cur) => {
        acc.set(cur.blockId, [...(acc.get(cur.blockId) ?? []), cur]);
        return acc;
      }, new Map<(typeof aboutPointRows)[number]["blockId"], typeof aboutPointRows>()),
    },
    bullet: {
      blocks: new Map(bulletBlockRows.map((row) => [row.blockId, row])),
      points: bulletPointRows.reduce((acc, cur) => {
        acc.set(cur.blockId, [...(acc.get(cur.blockId) ?? []), cur]);
        return acc;
      }, new Map<(typeof bulletPointRows)[number]["blockId"], typeof bulletPointRows>()),
    },
    twoColumn: {
      blocks: new Map(twoColumnBlockRows.map((row) => [row.blockId, row])),
      rows: twoColumnPointRows.reduce((acc, cur) => {
        acc.set(cur.blockId, [...(acc.get(cur.blockId) ?? []), cur]);
        return acc;
      }, new Map<(typeof twoColumnPointRows)[number]["blockId"], typeof twoColumnPointRows>()),
    },
    spacer: {
      blocks: new Map(spacerBlockRows.map((row) => [row.blockId, row])),
    },
    section: {
      blocks: new Map(sectionBlockRows.map((row) => [row.blockId, row])),
      children: sectionChildRows.reduce((acc, cur) => {
        acc.set(cur.sectionBlockId, [
          ...(acc.get(cur.sectionBlockId) ?? []),
          cur,
        ]);
        return acc;
      }, new Map<(typeof sectionChildRows)[number]["sectionBlockId"], typeof sectionChildRows>()),
    },
  };
}

// type ResolvedBlock<T extends BlockWithSection["type"]> = T extends "section"
//   ? // Special case for sections, which need to resolve their children.
//     // Since children gets resolved with 1 pass, we will tie the references
//     // after all blocks are resolved.
//     {
//       type: "section";
//       header: [string, string];
//       blockRefs: {
//         blockId: string;
//         orderIndex: number;
//       }[];
//     }
//   : Extract<BlockWithSection, { type: T }>;

export type MapValue<T> = T extends Map<unknown, infer V> ? V : never;

export type L1_DocumentBlockResolver<T extends BaseBlock["type"]> = {
  type: T;
  resolve: (ctx: {
    block: MapValue<Awaited<ReturnType<typeof getDocumentBlockMappings>>>;
    maps: Awaited<ReturnType<typeof getBlockMappings>>;
  }) => Promise<
    | {
        ok: true;
        value: Extract<BaseBlock, { type: T }>;
        orderIndex: number;
      }
    | {
        ok: false;
        error: string;
      }
  >;
};

export type L2_DocumentBlockResolver<T extends BlockWithSection["type"]> = {
  type: T;
  resolve: (ctx: {
    block: MapValue<Awaited<ReturnType<typeof getDocumentBlockMappings>>>;
    maps: Awaited<ReturnType<typeof getBlockMappings>>;
    blocksFromL1: BaseBlock[];
  }) => Promise<
    | {
        ok: true;
        value: BlockWithSection;
        orderIndex: number;
      }
    | {
        ok: false;
        error: string;
      }
  >;
};

export type L1_DocumentBlockInserter<T extends BaseBlock["type"]> = {
  type: T;
};
