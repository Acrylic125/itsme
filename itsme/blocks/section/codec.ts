import db from "@/db/db";
import { sectionBlockChildren, sectionBlocks } from "@/db/schema";
import type { BlockWithSection } from "@/blocks/schema";
// import type {
//   L1_DocumentBlockInserter,
//   L2_DocumentBlockInserter,
// } from "@/blocks/insertion-utils";
import type { BaseBlock } from "./schema";
import type { L2_DocumentBlockResolver } from "../retriever-utils";

// export async function insertSectionBlockDetails(args: {
//   tx: typeof db;
//   blockId: string;
//   block: Extract<BlockWithSection, { type: "section" }>;
// }) {
//   const { tx, blockId, block } = args;
//   await tx.insert(sectionBlocks).values({
//     blockId,
//     headerLeftContent: block.header[0],
//     headerRightContent: block.header[1],
//   });
// }

// export async function insertSectionBlockChildren(args: {
//   tx: typeof db;
//   sectionBlockId: string;
//   childBlockIds: Array<{ blockId: string; orderIndex: number }>;
// }) {
//   const { tx, sectionBlockId, childBlockIds } = args;
//   if (childBlockIds.length === 0) return;
//   await tx.insert(sectionBlockChildren).values(
//     childBlockIds.map((child) => ({
//       sectionBlockId,
//       childBlockId: child.blockId,
//       orderIndex: child.orderIndex,
//     }))
//   );
// }

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

// export const sectionBlockL1Inserter: L1_DocumentBlockInserter<"section"> = {
//   type: "section",
//   insert: async ({ tx, blockId, entry }) => {
//     await insertSectionBlockDetails({
//       tx,
//       blockId,
//       block: entry.block,
//     });
//     return { ok: true };
//   },
// };

// export const sectionBlockL2Inserter: L2_DocumentBlockInserter<"section"> = {
//   type: "section",
//   insert: async ({ tx, blockId, entry, context }) => {
//     const childRefs = context.plan.sectionChildLinks
//       .filter((ref) => ref.sectionKey === entry.key)
//       .sort((a, b) => a.orderIndex - b.orderIndex);
//     const childBlockIds: Array<{ blockId: string; orderIndex: number }> = [];
//     for (const childRef of childRefs) {
//       const childBlockId = context.blockIdByKey.get(childRef.childKey);
//       if (!childBlockId) {
//         return {
//           ok: false,
//           error: `Child block not inserted for key ${childRef.childKey}`,
//         };
//       }
//       childBlockIds.push({
//         blockId: childBlockId,
//         orderIndex: childRef.orderIndex,
//       });
//     }
//     await insertSectionBlockChildren({
//       tx,
//       sectionBlockId: blockId,
//       childBlockIds,
//     });
//     return { ok: true };
//   },
// };
