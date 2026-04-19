// import { aboutBlockInserter } from "./about/codec";
// import { bulletListBlockInserter } from "./bullet-list/codec";
// import {
//   sectionBlockL2Inserter,
//   sectionBlockL1Inserter,
// } from "./section/codec";
// import { twoColumnListBlockInserter } from "./two-column-list/codec";
// import { vSpacerBlockInserter } from "./v-spacer/codec";
// import {
//   // buildBlockInsertPlan,
//   insertBlockBaseRow,
//   type BlockInsertionContext,
//   type L1_DocumentBlockInserter,
//   type L2_DocumentBlockInserter,
//   withBlockInsertTransaction,
// } from "./insertion-utils";
// import type { DocumentDefinition } from "./schema";

// const L1_INSERTERS = [
//   aboutBlockInserter,
//   bulletListBlockInserter,
//   twoColumnListBlockInserter,
//   vSpacerBlockInserter,
//   sectionBlockL1Inserter,
// ] as const;

// const L2_INSERTERS = [sectionBlockL2Inserter] as const;

// export async function blockInsertionPipeline(args: {
//   documentId: string;
//   document: Pick<DocumentDefinition, "blocks">;
// }) {
//   // const plan = buildBlockInsertPlan(args.document);
//   return withBlockInsertTransaction(async (tx) => {
//     const context: BlockInsertionContext = {
//       plan,
//       blockIdByKey: new Map<string, string>(),
//     };

//     for (const inserter of L1_INSERTERS) {
//       const entryType = inserter.type as keyof typeof context.plan.byType;
//       const entries = context.plan.byType[entryType];
//       for (const entry of entries) {
//         const blockId = await insertBlockBaseRow({
//           tx,
//           documentId: args.documentId,
//           blockType: entry.type as Parameters<
//             typeof insertBlockBaseRow
//           >[0]["blockType"],
//           orderIndex: entry.orderIndex,
//         });
//         context.blockIdByKey.set(entry.key, blockId);
//         const result = await inserter.insert({
//           tx,
//           blockId,
//           entry,
//           context,
//         });
//         if (!result.ok) {
//           throw new Error(result.error);
//         }
//       }
//     }

//     for (const inserter of L2_INSERTERS) {
//       for (const entry of context.plan.byType[inserter.type]) {
//         const blockId = context.blockIdByKey.get(entry.key);
//         if (!blockId) {
//           throw new Error(`Missing inserted section id for key ${entry.key}`);
//         }
//         const result = await inserter.insert({
//           tx,
//           blockId,
//           entry,
//           context,
//         });
//         if (!result.ok) {
//           throw new Error(result.error);
//         }
//       }
//     }

//     return context;
//   });
// }
