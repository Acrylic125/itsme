import { Block } from "./blocks";
import { getDocumentBlockMappings, getDocumentMainLayout } from "./retriever-utils";
import { TextBlockRetriever } from "./text/server";
import { SectionBlockRetriever } from "./section/server";
import { ColumnsBlockRetriever } from "./columns/server";
import { ListBlockRetriever } from "./list/server";

const L1_RETRIEVERS = [
  TextBlockRetriever,
  SectionBlockRetriever,
  ColumnsBlockRetriever,
  ListBlockRetriever,
] as const;

const retrieverByType = new Map(L1_RETRIEVERS.map((r) => [r.type, r]));

export async function blockResolverPipeline(ctx: {
  mainLayout: Awaited<ReturnType<typeof getDocumentMainLayout>>;
  blockMap: Awaited<ReturnType<typeof getDocumentBlockMappings>>;
}): Promise<Block[]> {
  const settled = await Promise.all(
    ctx.mainLayout.map(async (layoutItem) => {
      const block = ctx.blockMap.get(layoutItem.blockId);
      if (!block) {
        return null;
      }
      const retriever = retrieverByType.get(block.type);
      if (!retriever) {
        return null;
      }
      const resolved = await retriever.resolve({ block });
      if (!resolved.ok) {
        return null;
      }
      return resolved;
    })
  );

  return settled
    .flatMap((result) =>
      result && result.ok
        ? [{ value: result.value, orderIndex: result.orderIndex }]
        : []
    )
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((result) => result.value);
}
