import db from "@/db/db";
import { bulletListBlocks, bulletListPoints } from "@/db/schema";
import type { BlockWithSection } from "@/components/document-blocks";
import type { InsertBlockHelpers } from "@/blocks/server-codec-types";
import { L1_DocumentBlockResolver } from "../retriever-utils";

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

export const bulletListBlockResolver: L1_DocumentBlockResolver<"bullet-list"> =
  {
    type: "bullet-list",
    resolve: async ({ block, maps }) => {
      const detail = maps.bullet.blocks.get(block.id);
      if (!detail) return { ok: false, error: "Bullet list block not found" };
      const points = maps.bullet.points.get(block.id) ?? [];
      return {
        ok: true,
        value: {
          id: block.id,
          type: "bullet-list",
          header:
            detail.headerLeftContent != null &&
            detail.headerRightContent != null
              ? [detail.headerLeftContent, detail.headerRightContent]
              : null,
          points: points.map((point) => ({
            refPointId: point.pointId,
            value: point.content,
          })),
        },
        orderIndex: block.orderIndex,
      };
    },
  };
