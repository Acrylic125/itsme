import db from "@/db/db";
import { sectionBlockChildren, sectionBlocks } from "@/db/schema";
import type { Block, BlockWithSection } from "@/components/document-blocks";
import type {
  DecodeBlockHelpers,
  DecodeBlockMaps,
  InsertBlockHelpers,
} from "@/blocks/server-codec-types";

export async function insertSectionBlockDetails(args: {
  blockId: string;
  block: Extract<BlockWithSection, { type: "section" }>;
  helpers: InsertBlockHelpers;
}) {
  const { blockId, block, helpers } = args;
  await db.insert(sectionBlocks).values({
    blockId,
    headerLeftContent: block.header[0],
    headerRightContent: block.header[1],
  });

  for (let index = 0; index < block.blocks.length; index += 1) {
    const childBlock = block.blocks[index] as Block;
    const childBlockId = await helpers.insertBlock(childBlock);
    await db.insert(sectionBlockChildren).values({
      sectionBlockId: blockId,
      childBlockId,
      orderIndex: index,
    });
  }
}

export function decodeSectionBlock(args: {
  blockId: string;
  maps: DecodeBlockMaps;
  helpers: DecodeBlockHelpers;
}): Extract<BlockWithSection, { type: "section" }> | null {
  const { blockId, maps, helpers } = args;
  const detail = maps.sectionByBlockId.get(blockId);
  if (!detail) return null;

  const children = (maps.sectionChildrenBySectionId.get(blockId) ?? [])
    .map((childId) => helpers.buildBlock(childId))
    .filter((block): block is Block => block != null && block.type !== "section");

  return {
    type: "section",
    header: [detail.headerLeftContent, detail.headerRightContent],
    blocks: children,
  };
}
