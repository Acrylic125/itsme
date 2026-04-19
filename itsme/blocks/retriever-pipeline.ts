import { aboutBlockResolver } from "./about/codec";
import { bulletListBlockResolver } from "./bullet-list/codec";
import { getBlockMappings, getDocumentBlockMappings } from "./retriever-utils";
import { BaseBlock } from "./section/schema";
import { BlockWithSection, DocumentDefinition } from "./schema";
import { sectionBlockResolver } from "./section/codec";
import { twoColumnListBlockResolver } from "./two-column-list/codec";
import { vSpacerBlockResolver } from "./v-spacer/codec";

const L1_RESOLVERS = [
  aboutBlockResolver,
  bulletListBlockResolver,
  twoColumnListBlockResolver,
  vSpacerBlockResolver,
] as const;

const L2_RESOLVERS = [sectionBlockResolver] as const;

export async function blockResolverPipeline(ctx: {
  blockMap: Awaited<ReturnType<typeof getDocumentBlockMappings>>;
  maps: Awaited<ReturnType<typeof getBlockMappings>>;
}): Promise<BlockWithSection[]> {
  let resultFromL1: BaseBlock[] = [];
  const ordered: Array<{ orderIndex: number; block: BlockWithSection }> = [];

  for (const resolver of L1_RESOLVERS) {
    for (const block of ctx.blockMap.values()) {
      if (block.type !== resolver.type) continue;
      const result = await resolver.resolve({
        block,
        maps: ctx.maps,
      });
      if (result.ok) {
        resultFromL1.push(result.value);
        ordered.push({ orderIndex: block.orderIndex, block: result.value });
      } else {
        throw new Error(result.error);
      }
    }
  }

  for (const resolver of L2_RESOLVERS) {
    for (const block of ctx.blockMap.values()) {
      if (block.type !== resolver.type) continue;
      const result = await resolver.resolve({
        block,
        maps: ctx.maps,
        blocksFromL1: resultFromL1,
      });
      if (result.ok) {
        ordered.push({ orderIndex: block.orderIndex, block: result.value });
        resultFromL1 = resultFromL1.filter(
          (b) => !result.removedBlockIds.includes(b.id)
        );
      } else {
        throw new Error(result.error);
      }
    }
  }

  return ordered
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((row) => row.block);
}

// export function createEmptyDocument(name: string): DocumentDefinition {
//   return {
//     name,
//     pageSize: { width: 8.5, height: 11 },
//     font: "Times New Roman",
//     spacingBelow: {
//       about: 11,
//       "bullet-list": 11,
//       "2-column-list": 11,
//       section: 11,
//       "v-spacer": 0,
//     },
//     margins: {
//       top: 24,
//       bottom: 24,
//       left: 24,
//       right: 24,
//     },
//     textStyles: {
//       default: { fontSize: 11, fontWeight: "normal", lineHeight: 1.2 },
//       h1: { fontSize: 16, fontWeight: "normal", lineHeight: 1.2 },
//       h2: { fontSize: 14, fontWeight: "bold", lineHeight: 1.2 },
//       h3: { fontSize: 12, fontWeight: "bold", lineHeight: 1.2 },
//       h4: { fontSize: 11, fontWeight: "bold", lineHeight: 1.2 },
//     },
//     bulletListStyle: {
//       bullet: "•",
//       indent: 11,
//       gap: 11,
//     },
//     blocks: [],
//   };
// }
