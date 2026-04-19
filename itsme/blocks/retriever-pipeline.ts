import { aboutBlockResolver } from "./about/codec";
import { bulletListBlockResolver } from "./bullet-list/codec";
import { getBlockMappings, getDocumentBlockMappings } from "./retriever-utils";
import { BaseBlock } from "./section/schema";
import { BlockWithSection } from "./schema";
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

/** Block ids that appear as children of a section — omit from top-level output (they render inside the section). */
function getSectionChildBlockIds(
  maps: Awaited<ReturnType<typeof getBlockMappings>>
): Set<string> {
  const ids = new Set<string>();
  for (const refs of maps.section.children.values()) {
    for (const ref of refs) {
      ids.add(ref.childBlockId);
    }
  }
  return ids;
}

export async function blockResolverPipeline(ctx: {
  blockMap: Awaited<ReturnType<typeof getDocumentBlockMappings>>;
  maps: Awaited<ReturnType<typeof getBlockMappings>>;
}): Promise<BlockWithSection[]> {
  const resultFromL1: BaseBlock[] = [];
  const ordered: Array<{ orderIndex: number; block: BlockWithSection }> = [];
  const sectionChildIds = getSectionChildBlockIds(ctx.maps);

  for (const resolver of L1_RESOLVERS) {
    for (const block of ctx.blockMap.values()) {
      if (block.type !== resolver.type) continue;
      const result = await resolver.resolve({
        block,
        maps: ctx.maps,
      });
      if (result.ok) {
        resultFromL1.push(result.value);
        if (!sectionChildIds.has(block.id)) {
          ordered.push({ orderIndex: block.orderIndex, block: result.value });
        }
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
      } else {
        throw new Error(result.error);
      }
    }
  }

  return ordered
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((row) => row.block);
}
