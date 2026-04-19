import db from "@/db/db";
import { vSpacerBlocks } from "@/db/schema";
import type { BlockWithSection } from "@/blocks/schema";
import type { L1_DocumentBlockInserter } from "@/blocks/insertion-utils";
import { L1_DocumentBlockResolver } from "../retriever-utils";

export async function insertSpacerBlockDetails(args: {
  tx: typeof db;
  blockId: string;
  block: Extract<BlockWithSection, { type: "v-spacer" }>;
}) {
  const { tx, blockId, block } = args;
  await tx.insert(vSpacerBlocks).values({
    blockId,
    height: Math.round(block.height),
  });
}

export const vSpacerBlockResolver: L1_DocumentBlockResolver<"v-spacer"> = {
  type: "v-spacer",
  resolve: async ({ block, maps }) => {
    const detail = maps.spacer.blocks.get(block.id);
    if (!detail) return { ok: false, error: "Spacer block not found" };
    return {
      ok: true,
      value: {
        id: block.id,
        type: "v-spacer",
        height: detail.height,
      },
      orderIndex: block.orderIndex,
    };
  },
};

export const vSpacerBlockInserter: L1_DocumentBlockInserter<"v-spacer"> = {
  type: "v-spacer",
  insert: async ({ tx, blockId, entry }) => {
    await insertSpacerBlockDetails({
      tx,
      blockId,
      block: entry.block,
    });
    return { ok: true };
  },
};
