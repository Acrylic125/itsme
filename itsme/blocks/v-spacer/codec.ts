import db from "@/db/db";
import { vSpacerBlocks } from "@/db/schema";
import type { BlockWithSection } from "@/components/document-blocks";
import type { DecodeBlockMaps, InsertBlockHelpers } from "@/blocks/server-codec-types";

export async function insertSpacerBlockDetails(args: {
  blockId: string;
  block: Extract<BlockWithSection, { type: "v-spacer" }>;
  helpers: InsertBlockHelpers;
}) {
  const { blockId, block } = args;
  await db.insert(vSpacerBlocks).values({
    blockId,
    height: Math.round(block.height),
  });
}

export function decodeSpacerBlock(args: {
  blockId: string;
  maps: DecodeBlockMaps;
}): Extract<BlockWithSection, { type: "v-spacer" }> | null {
  const { blockId, maps } = args;
  const detail = maps.spacerByBlockId.get(blockId);
  if (!detail) return null;

  return {
    type: "v-spacer",
    height: detail.height,
  };
}
