import { Block } from "./blocks";
import { getRetrieverContextData } from "./retriever-utils";
import { TextBlockSchema } from "./text/schema";
import { SectionBlockSchema } from "./section/schema";
import { ColumnsBlockSchema } from "./columns/schema";
import { ListBlockSchema } from "./list/schema";
import z from "zod";

export async function blockResolverPipeline(ctx: {
  // mainLayout: Awaited<ReturnType<typeof getDocumentMainLayout>>;
  data: Awaited<ReturnType<typeof getRetrieverContextData>>;
}): Promise<Block[]> {
  const blocks: Block[] = [];
  ctx.data.textBlocks.forEach((block) => {
    const parsed: z.infer<typeof TextBlockSchema> = {
      id: block.blockId,
      type: "text",
      text: block.text,
      align: block.align,
      style: block.style,
      ref: block.ref ?? undefined,
    };
    blocks.push(parsed);
  });
  ctx.data.sectionBlocks.forEach((block) => {
    const parsed: z.infer<typeof SectionBlockSchema> = {
      id: block.blockId,
      type: "section",
      blocks: ctx.data.sectionBlockChildren.get(block.blockId) ?? [],
      ref: block.ref ?? undefined,
    };
    blocks.push(parsed);
  });
  ctx.data.columnsBlocks.forEach((block) => {
    const parsed: z.infer<typeof ColumnsBlockSchema> = {
      id: block.blockId,
      type: "columns",
      blocks: (ctx.data.columnsBlockChildren.get(block.blockId) ?? []).map(
        (c) => ({
          span: c.span,
          blockId: c.childBlockId,
        })
      ),
      ref: block.ref ?? undefined,
    };
    blocks.push(parsed);
  });
  ctx.data.listBlocks.forEach((block) => {
    const bullet =
      block.bulletType === "normal"
        ? {
            type: "normal" as const,
            value: block.bulletValue ?? "-",
          }
        : ({
            type: block.bulletType,
          } as const);

    const parsed: z.infer<typeof ListBlockSchema> = {
      id: block.blockId,
      type: "list",
      blocks: ctx.data.listBlockChildren.get(block.blockId) ?? [],
      bullet,
      leftSpace: block.leftSpace ?? undefined,
      rightSpace: block.rightSpace ?? undefined,
      ref: block.ref ?? undefined,
    };

    blocks.push(parsed);
  });
  return blocks;
}
