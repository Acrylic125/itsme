import { Block } from "./blocks";
import {
  blocks,
  columnsBlockChildren,
  columnsBlocks,
  documentMainLayout,
  listBlockChildren,
  listBlocks,
  sectionBlockChildren,
  sectionBlocks,
  textBlocks,
} from "@/db/schema";
import { TextBlockSchema } from "./text/schema";
import { SectionBlockSchema } from "./section/schema";
import { ColumnsBlockSchema } from "./columns/schema";
import { ListBlockSchema } from "./list/schema";
import z from "zod";
import db from "@/db/db";
import { asc, eq } from "drizzle-orm";

export async function getDocumentMainLayout(documentId: string) {
  const mainLayoutRows = await db
    .select({
      blockId: documentMainLayout.blockId,
      orderIndex: documentMainLayout.orderIndex,
    })
    .from(documentMainLayout)
    .where(eq(documentMainLayout.documentId, documentId))
    .orderBy(asc(documentMainLayout.orderIndex));
  return mainLayoutRows;
}

export async function getRetrieverContextData(documentId: string) {
  const [
    _textBlocks,
    _sectionBlocks,
    _secitonBlockChildren,
    _listBlocks,
    _listBlockChildren,
    _columnsBlocks,
    _columnsBlockChildren,
  ] = await db.batch([
    db
      .select({
        blockId: blocks.id,
        type: blocks.type,
        text: textBlocks.text,
        align: textBlocks.align,
        style: textBlocks.style,
        ref: textBlocks.ref,
        orderIndex: blocks.orderIndex,
      })
      .from(textBlocks)
      .innerJoin(blocks, eq(textBlocks.blockId, blocks.id))
      .where(eq(blocks.documentId, documentId)),
    db
      .select({
        blockId: blocks.id,
        type: blocks.type,
        ref: sectionBlocks.ref,
        orderIndex: blocks.orderIndex,
      })
      .from(sectionBlocks)
      .innerJoin(blocks, eq(sectionBlocks.blockId, blocks.id))
      .where(eq(blocks.documentId, documentId)),
    db
      .select({
        sectionBlockId: sectionBlockChildren.sectionBlockId,
        childBlockId: sectionBlockChildren.childBlockId,
        orderIndex: sectionBlockChildren.orderIndex,
      })
      .from(sectionBlockChildren)
      .innerJoin(blocks, eq(sectionBlockChildren.sectionBlockId, blocks.id))
      .where(eq(blocks.documentId, documentId)),
    db
      .select({
        blockId: blocks.id,
        type: blocks.type,
        bulletType: listBlocks.bulletType,
        bulletValue: listBlocks.bulletValue,
        leftSpace: listBlocks.leftSpace,
        rightSpace: listBlocks.rightSpace,
        ref: listBlocks.ref,
        orderIndex: blocks.orderIndex,
      })
      .from(listBlocks)
      .innerJoin(blocks, eq(listBlocks.blockId, blocks.id))
      .where(eq(blocks.documentId, documentId)),
    db
      .select({
        listBlockId: listBlockChildren.listBlockId,
        childBlockId: listBlockChildren.childBlockId,
        orderIndex: listBlockChildren.orderIndex,
      })
      .from(listBlockChildren)
      .innerJoin(blocks, eq(listBlockChildren.listBlockId, blocks.id))
      .where(eq(blocks.documentId, documentId)),
    db
      .select({
        blockId: blocks.id,
        type: blocks.type,
        ref: columnsBlocks.ref,
        orderIndex: blocks.orderIndex,
      })
      .from(columnsBlocks)
      .innerJoin(blocks, eq(columnsBlocks.blockId, blocks.id))
      .where(eq(blocks.documentId, documentId)),
    db
      .select({
        columnsBlockId: columnsBlockChildren.columnsBlockId,
        childBlockId: columnsBlockChildren.childBlockId,
        span: columnsBlockChildren.span,
        orderIndex: columnsBlockChildren.orderIndex,
      })
      .from(columnsBlockChildren)
      .innerJoin(blocks, eq(columnsBlockChildren.columnsBlockId, blocks.id))
      .where(eq(blocks.documentId, documentId)),
  ]);
  return {
    textBlocks: new Map(_textBlocks.map((b) => [b.blockId, b])),
    sectionBlocks: new Map(_sectionBlocks.map((b) => [b.blockId, b])),
    // Reduction of sectionBlockChildren to a map of sectionBlockId to childBlockIds
    sectionBlockChildren: _secitonBlockChildren.reduce((acc, curr) => {
      const current = acc.get(curr.sectionBlockId) ?? [];
      current.push(curr.childBlockId);
      acc.set(curr.sectionBlockId, current);
      return acc;
    }, new Map<string, string[]>()),
    listBlocks: new Map(_listBlocks.map((b) => [b.blockId, b])),
    listBlockChildren: _listBlockChildren.reduce((acc, curr) => {
      const current = acc.get(curr.listBlockId) ?? [];
      current.push(curr.childBlockId);
      acc.set(curr.listBlockId, current);
      return acc;
    }, new Map<string, string[]>()),
    columnsBlocks: new Map(_columnsBlocks.map((b) => [b.blockId, b])),
    columnsBlockChildren: _columnsBlockChildren.reduce((acc, curr) => {
      const current = acc.get(curr.columnsBlockId) ?? [];
      current.push(curr);
      acc.set(curr.columnsBlockId, current);
      return acc;
    }, new Map<string, typeof _columnsBlockChildren>()),
  };
}

export async function mapBlocks(ctx: {
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
