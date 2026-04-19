import db from "@/db/db";
import { bulletListBlocks, bulletListPoints, points } from "@/db/schema";
import type { BlockWithSection } from "@/blocks/schema";
// import type { L1_DocumentBlockInserter } from "@/blocks/insertion-utils";
// import { createPrefixedId } from "@/blocks/insertion-utils";
import { L1_DocumentBlockResolver } from "../retriever-utils";

// export async function insertBulletListBlockDetails(args: {
//   tx: typeof db;
//   blockId: string;
//   block: Extract<BlockWithSection, { type: "bullet-list" }>;
// }) {
//   const { tx, blockId, block } = args;
//   await tx.insert(bulletListBlocks).values({
//     blockId,
//     headerLeftContent: block.header?.[0] ?? null,
//     headerRightContent: block.header?.[1] ?? null,
//   });

//   const contents = block.points.map((point) => point.value);
//   if (contents.length > 0) {
//     const pointIds = contents.map(() => createPrefixedId("p_"));
//     await tx.insert(points).values(
//       contents.map((content, index) => ({
//         id: pointIds[index],
//         content: content.slice(0, 512),
//         refPointId: null,
//       }))
//     );
//     await tx.insert(bulletListPoints).values(
//       pointIds.map((pointId, index) => ({
//         blockId,
//         pointId,
//         orderIndex: index,
//       }))
//     );
//   }
// }

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

// export const bulletListBlockInserter: L1_DocumentBlockInserter<"bullet-list"> = {
//   type: "bullet-list",
//   insert: async ({ tx, blockId, entry }) => {
//     await insertBulletListBlockDetails({
//       tx,
//       blockId,
//       block: entry.block,
//     });
//     return { ok: true };
//   },
// };
