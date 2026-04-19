import db from "@/db/db";
import { aboutBlockPoints, aboutBlocks } from "@/db/schema";
import type { BlockWithSection } from "@/components/document-blocks";
import type { InsertBlockHelpers } from "@/blocks/server-codec-types";
import { L1_DocumentBlockResolver } from "../retriever-utils";

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

export const aboutBlockResolver: L1_DocumentBlockResolver<"about"> = {
  type: "about",
  resolve: async ({ block, maps }) => {
    const detail = maps.about.blocks.get(block.id);
    if (!detail) return { ok: false, error: "About block not found" };
    const points = maps.about.points.get(block.id) ?? [];
    return {
      ok: true,
      value: {
        id: block.id,
        type: "about",
        header: detail.header,
        points: points.map((point) => ({
          refPointId: point.pointId,
          value: point.content,
        })),
      },
      orderIndex: block.orderIndex,
    };
  },
};
