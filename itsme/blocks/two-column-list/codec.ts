import db from "@/db/db";
import { points, twoColumnListBlocks, twoColumnListRows } from "@/db/schema";
import type { BlockWithSection } from "@/components/document-blocks";
import type { InsertBlockHelpers } from "@/blocks/server-codec-types";
import { L1_DocumentBlockResolver } from "../retriever-utils";

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

export const twoColumnListBlockResolver: L1_DocumentBlockResolver<"2-column-list"> =
  {
    type: "2-column-list",
    resolve: async ({ block, maps }) => {
      const detail = maps.twoColumn.blocks.get(block.id);
      if (!detail)
        return { ok: false, error: "Two column list block not found" };
      const points = maps.twoColumn.rows.get(block.id) ?? [];
      return {
        ok: true,
        value: {
          id: block.id,
          type: "2-column-list",
          header: null,
          points: points.map((point) => ({
            leftPoint: point.leftPoint,
            rightPoint: point.rightPoint,
          })),
        },
        orderIndex: block.orderIndex,
      };
    },
  };
