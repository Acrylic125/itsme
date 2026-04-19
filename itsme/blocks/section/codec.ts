import db from "@/db/db";
import { sectionBlockChildren, sectionBlocks } from "@/db/schema";
import type { Block, BlockWithSection } from "@/components/document-blocks";
import type { InsertBlockHelpers } from "@/blocks/server-codec-types";
import type { BaseBlock } from "./schema";
import type { L2_DocumentBlockResolver } from "../retriever-utils";

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

export const sectionBlockResolver: L2_DocumentBlockResolver<"section"> = {
  type: "section",
  resolve: async ({ block, maps, blocksFromL1 }) => {
    const detail = maps.section.blocks.get(block.id);
    if (!detail) return { ok: false, error: "Section block not found" };
    const childrenRefs = maps.section.children.get(block.id) ?? [];
    const sortedRefs = [...childrenRefs].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );
    const childrenBlocks = sortedRefs
      .map((ref) => blocksFromL1.find((child) => child.id === ref.childBlockId))
      .filter((child): child is BaseBlock => child != null);

    return {
      ok: true,
      value: {
        id: block.id,
        type: "section",
        header: [detail.headerLeftContent, detail.headerRightContent],
        blocks: childrenBlocks,
      },
      orderIndex: block.orderIndex,
    };
  },
};
