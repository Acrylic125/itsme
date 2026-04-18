import db from "@/db/db";
import { aboutBlockPoints, aboutBlocks } from "@/db/schema";
import type { BlockWithSection } from "@/components/document-blocks";
import type { DecodeBlockMaps, InsertBlockHelpers } from "@/blocks/server-codec-types";

export async function insertAboutBlockDetails(args: {
  blockId: string;
  block: Extract<BlockWithSection, { type: "about" }>;
  helpers: InsertBlockHelpers;
}) {
  const { blockId, block, helpers } = args;
  await db.insert(aboutBlocks).values({
    blockId,
    header: block.header,
  });

  const pointIds = await helpers.insertPointChain(block.points);
  if (pointIds.length > 0) {
    await db.insert(aboutBlockPoints).values(
      pointIds.map((pointId, index) => ({
        blockId,
        pointId,
        orderIndex: index,
      }))
    );
  }
}

export function decodeAboutBlock(args: {
  blockId: string;
  maps: DecodeBlockMaps;
}): Extract<BlockWithSection, { type: "about" }> | null {
  const { blockId, maps } = args;
  const detail = maps.aboutByBlockId.get(blockId);
  if (!detail) return null;

  return {
    type: "about",
    header: detail.header,
    points: maps.aboutPointsByBlockId.get(blockId) ?? [],
  };
}
