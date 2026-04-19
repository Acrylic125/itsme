// import db from "@/db/db";
// import { blocks } from "@/db/schema";
// import { nanoid } from "nanoid";
// import type { BaseBlock } from "./section/schema";
// import type { BlockWithSection, DocumentDefinition } from "./schema";

// // export type BlockInsertionEntry<T extends InsertableBlock["type"]> = {
// //   key: string;
// //   type: T;
// //   block: Extract<InsertableBlock, { type: T }>;
// //   orderIndex: number;
// // };

// // export type SectionChildLink = {
// //   sectionKey: string;
// //   childKey: string;
// //   orderIndex: number;
// // };

// // export type BlockInsertPlan = {
// //   byType: {
// //     [K in InsertableBlock["type"]]: Array<BlockInsertionEntry<K>>;
// //   };
// //   sectionChildLinks: SectionChildLink[];
// // };

// // export type BlockInsertionContext = {
// //   plan: BlockInsertPlan;
// //   blockIdByKey: Map<string, string>;
// // };

// export type L1_DocumentBlockInserter<T extends BlockWithSection["type"]> = {
//   type: T;
//   insert: (ctx: {
//     tx: typeof db;
//     // blockId: string;
//     block: Extract<BlockWithSection, { type: T }>;
//     // context: BlockInsertionContext;
//   }) => Promise<{ ok: true } | { ok: false; error: string }>;
// };

// export type L2_DocumentBlockInserter<T extends BlockWithSection["type"]> = {
//   type: T;
//   insert: (ctx: {
//     tx: typeof db;

//     // blockId: string;
//     // entry: BlockInsertionEntry<T>;
//     // context: BlockInsertionContext;
//   }) => Promise<{ ok: true } | { ok: false; error: string }>;
// };

// export function createPrefixedId(prefix: "d_" | "b_" | "p_"): string {
//   const targetLength = 24;
//   const suffixLength = targetLength - prefix.length;
//   return `${prefix}${nanoid(suffixLength)}`;
// }

// export function createProjectId(): string {
//   const prefix = "pr_";
//   const targetLength = 24;
//   const suffixLength = targetLength - prefix.length;
//   return `${prefix}${nanoid(suffixLength)}`;
// }

// export async function insertBlockBaseRow(args: {
//   tx: typeof db;
//   documentId: string;
//   blockType: InsertableBlock["type"];
//   orderIndex: number;
// }): Promise<string> {
//   const blockId = createPrefixedId("b_");
//   await args.tx.insert(blocks).values({
//     id: blockId,
//     documentId: args.documentId,
//     type: args.blockType,
//     orderIndex: args.orderIndex,
//   });
//   return blockId;
// }

// export async function withBlockInsertTransaction<T>(
//   run: (tx: typeof db) => Promise<T>
// ): Promise<T> {
//   const transactionFn = (
//     db as unknown as {
//       transaction?: (cb: (tx: typeof db) => Promise<T>) => Promise<T>;
//     }
//   ).transaction;
//   if (typeof transactionFn === "function") {
//     return transactionFn(run);
//   }
//   return run(db);
// }

// // export function buildBlockInsertPlan(
// //   document: Pick<DocumentDefinition, "blocks">
// // ): BlockInsertPlan {
// //   const byType: BlockInsertPlan["byType"] = {
// //     about: [],
// //     "bullet-list": [],
// //     "2-column-list": [],
// //     "v-spacer": [],
// //     section: [],
// //   };
// //   const sectionChildLinks: SectionChildLink[] = [];
// //   let globalOrderIndex = 0;
// //   let blockCounter = 0;

// //   const nextKey = () => `k_${blockCounter++}`;

// //   for (const rootBlock of document.blocks) {
// //     if (rootBlock.type === "section") {
// //       const sectionKey = nextKey();
// //       byType.section.push({
// //         key: sectionKey,
// //         type: "section",
// //         block: rootBlock,
// //         orderIndex: globalOrderIndex++,
// //       });
// //       for (let childOrderIndex = 0; childOrderIndex < rootBlock.blocks.length; childOrderIndex += 1) {
// //         const childBlock = rootBlock.blocks[childOrderIndex];
// //         const childKey = nextKey();
// //         const childType = childBlock.type;
// //         (
// //           byType[childType] as Array<
// //             BlockInsertionEntry<(typeof childBlock)["type"]>
// //           >
// //         ).push({
// //           key: childKey,
// //           type: childType,
// //           block: childBlock,
// //           orderIndex: globalOrderIndex++,
// //         });
// //         sectionChildLinks.push({
// //           sectionKey,
// //           childKey,
// //           orderIndex: childOrderIndex,
// //         });
// //       }
// //       continue;
// //     }

// //     const t = rootBlock.type;
// //     (byType[t] as Array<BlockInsertionEntry<(typeof rootBlock)["type"]>>).push({
// //       key: nextKey(),
// //       type: t,
// //       block: rootBlock,
// //       orderIndex: globalOrderIndex++,
// //     });
// //   }

// //   return { byType, sectionChildLinks };
// // }
