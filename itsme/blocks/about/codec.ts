import db from "@/db/db";
import { aboutBlockPoints, aboutBlocks, points } from "@/db/schema";
import type { BlockWithSection } from "@/blocks/schema";
// import type { L1_DocumentBlockInserter } from "@/blocks/insertion-utils";
// import { createPrefixedId } from "@/blocks/insertion-utils";
import { L1_DocumentBlockResolver } from "../retriever-utils";

// export async function insertAboutBlockDetails(args: {
//   tx: typeof db;
//   blockId: string;
//   block: Extract<BlockWithSection, { type: "about" }>;
// }) {
//   const { tx, blockId, block } = args;
//   await tx.insert(aboutBlocks).values({
//     blockId,
//     header: block.header,
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
//     await tx.insert(aboutBlockPoints).values(
//       pointIds.map((pointId, index) => ({
//         blockId,
//         pointId,
//         orderIndex: index,
//       }))
//     );
//   }
// }

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

// export const aboutBlockInserter: L1_DocumentBlockInserter<"about"> = {
//   type: "about",
//   insert: async ({ tx, blockId, entry }) => {
//     await insertAboutBlockDetails({
//       tx,
//       blockId,
//       block: entry.block,
//     });
//     return { ok: true };
//   },
// };
