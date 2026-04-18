import db from "@/db/db";
import { points, twoColumnListBlocks, twoColumnListRows } from "@/db/schema";
import type { BlockWithSection } from "@/components/document-blocks";
import type {
  DecodeBlockMaps,
  InsertBlockHelpers,
} from "@/blocks/server-codec-types";

export async function insertTwoColumnListBlockDetails(args: {
  blockId: string;
  block: Extract<BlockWithSection, { type: "2-column-list" }>;
  helpers: InsertBlockHelpers;
}) {
  const { blockId, block, helpers } = args;
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
  const pointValues: Array<{
    id: string;
    content: string;
    refPointId: string | null;
  }> = [];

  for (let index = 0; index < block.points.length; index += 1) {
    const [left, right] = block.points[index];
    const leftPointId = helpers.createPrefixedId("p_");
    const rightPointId = helpers.createPrefixedId("p_");
    pointValues.push(
      { id: leftPointId, content: left.slice(0, 512), refPointId: null },
      {
        id: rightPointId,
        content: right.slice(0, 512),
        refPointId: leftPointId,
      }
    );
    rowValues.push({
      blockId,
      leftPointId,
      rightPointId,
      orderIndex: index,
    });
  }

  if (pointValues.length > 0) {
    await db.insert(points).values(pointValues);
  }

  if (rowValues.length > 0) {
    await db.insert(twoColumnListRows).values(rowValues);
  }
}

export function decodeTwoColumnListBlock(args: {
  blockId: string;
  maps: DecodeBlockMaps;
}): Extract<BlockWithSection, { type: "2-column-list" }> | null {
  const { blockId, maps } = args;
  const detail = maps.twoColumnByBlockId.get(blockId);
  if (!detail) return null;

  const hasHeader =
    detail.headerLeftContent != null && detail.headerRightContent != null;
  return {
    type: "2-column-list",
    header: hasHeader
      ? [detail.headerLeftContent!, detail.headerRightContent!]
      : null,
    points: maps.twoColumnPointsByBlockId.get(blockId) ?? [],
  };
}
