import db from "@/db/db";
import { bulletListBlocks, bulletListPoints } from "@/db/schema";
import type { BlockWithSection } from "@/components/document-blocks";
import type { DecodeBlockMaps, InsertBlockHelpers } from "@/blocks/server-codec-types";

export async function insertBulletListBlockDetails(args: {
  blockId: string;
  block: Extract<BlockWithSection, { type: "bullet-list" }>;
  helpers: InsertBlockHelpers;
}) {
  const { blockId, block, helpers } = args;
  await db.insert(bulletListBlocks).values({
    blockId,
    headerLeftContent: block.header?.[0] ?? null,
    headerRightContent: block.header?.[1] ?? null,
  });

  const pointIds = await helpers.insertPointChain(block.points);
  if (pointIds.length > 0) {
    await db.insert(bulletListPoints).values(
      pointIds.map((pointId, index) => ({
        blockId,
        pointId,
        orderIndex: index,
      }))
    );
  }
}

export function decodeBulletListBlock(args: {
  blockId: string;
  maps: DecodeBlockMaps;
}): Extract<BlockWithSection, { type: "bullet-list" }> | null {
  const { blockId, maps } = args;
  const detail = maps.bulletByBlockId.get(blockId);
  if (!detail) return null;

  const hasHeader =
    detail.headerLeftContent != null && detail.headerRightContent != null;
  return {
    type: "bullet-list",
    header: hasHeader
      ? [detail.headerLeftContent!, detail.headerRightContent!]
      : null,
    points: maps.bulletPointsByBlockId.get(blockId) ?? [],
  };
}
