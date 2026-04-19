import db from "@/db/db";
import { vSpacerBlocks } from "@/db/schema";
import { L1_DocumentBlockResolver } from "../retriever-utils";

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
