import { Block, DEFAULT_STYLE_SHEET, StyleSheetSchema } from "./blocks";
import {
  blocks,
  columnsBlockChildren,
  columnsBlocks,
  documentListStyles,
  documentMainLayout,
  documentPageStyles,
  documents,
  documentTextStyles,
  listBlockChildren,
  listBlocks,
  sectionBlockChildren,
  sectionBlocks,
  textBlocks,
} from "@/db/schema";
import {
  TextBlockSchema,
  TextStyleSchema,
  TextStyleSheetSchema,
} from "./text/schema";
import { SectionBlockSchema } from "./section/schema";
import { ColumnsBlockSchema } from "./columns/schema";
import { ListBlockSchema } from "./list/schema";
import z from "zod";
import db from "@/db/db";
import { asc, eq } from "drizzle-orm";

// export async function getDocumentMainLayout(documentId: string) {
//   const mainLayoutRows = await db
//     .select({
//       blockId: documentMainLayout.blockId,
//       orderIndex: documentMainLayout.orderIndex,
//     })
//     .from(documentMainLayout)
//     .where(eq(documentMainLayout.documentId, documentId))
//     .orderBy(asc(documentMainLayout.orderIndex));
//   return mainLayoutRows;
// }

export async function getRetrieverContextData(documentId: string) {
  const [
    _document,
    _mainLayout,
    _pageStyles,
    _textStyles,
    _listStyles,
    // Block specific
    _textBlocks,
    _sectionBlocks,
    _secitonBlockChildren,
    _listBlocks,
    _listBlockChildren,
    _columnsBlocks,
    _columnsBlockChildren,
  ] = await db.batch([
    // Document
    db
      .select({
        id: documents.id,
        name: documents.name,
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1),
    db
      .select({
        blockId: documentMainLayout.blockId,
        orderIndex: documentMainLayout.orderIndex,
      })
      .from(documentMainLayout)
      .where(eq(documentMainLayout.documentId, documentId))
      .orderBy(asc(documentMainLayout.orderIndex)),
    // Page styles
    db
      .select({
        gap: documentPageStyles.gap,
        marginTop: documentPageStyles.marginTop,
        marginBottom: documentPageStyles.marginBottom,
        marginLeft: documentPageStyles.marginLeft,
        marginRight: documentPageStyles.marginRight,
      })
      .from(documentPageStyles)
      .where(eq(documentPageStyles.documentId, documentId)),
    // Text styles
    db
      .select({
        style: documentTextStyles.style,
        fontSize: documentTextStyles.fontSize,
        fontWeight: documentTextStyles.fontWeight,
        fontFamily: documentTextStyles.fontFamily,
        lineHeight: documentTextStyles.lineHeight,
      })
      .from(documentTextStyles)
      .where(eq(documentTextStyles.documentId, documentId)),
    // List styles
    db
      .select({
        leftSpace: documentListStyles.leftSpace,
        rightSpace: documentListStyles.rightSpace,
      })
      .from(documentListStyles)
      .where(eq(documentListStyles.documentId, documentId)),
    // Block specific
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

  if (_document.length === 0) {
    throw new Error(`Document ${documentId} not found`);
  }

  return {
    document: _document[0],
    mainLayout: _mainLayout,
    styles: {
      pageStyles: _pageStyles.length === 0 ? null : _pageStyles[0],
      textStyles: _textStyles,
      listStyles: _listStyles.length === 0 ? null : _listStyles[0],
    },
    // Block specific
    blocks: {
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
    },
  };
}

export async function mapBlocks(ctx: {
  // mainLayout: Awaited<ReturnType<typeof getDocumentMainLayout>>;
  data: Awaited<ReturnType<typeof getRetrieverContextData>>;
}): Promise<Block[]> {
  const blocks: Block[] = [];
  ctx.data.blocks.textBlocks.forEach((block) => {
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
  ctx.data.blocks.sectionBlocks.forEach((block) => {
    const parsed: z.infer<typeof SectionBlockSchema> = {
      id: block.blockId,
      type: "section",
      blocks: ctx.data.blocks.sectionBlockChildren.get(block.blockId) ?? [],
      ref: block.ref ?? undefined,
    };
    blocks.push(parsed);
  });
  ctx.data.blocks.columnsBlocks.forEach((block) => {
    const parsed: z.infer<typeof ColumnsBlockSchema> = {
      id: block.blockId,
      type: "columns",
      blocks: (
        ctx.data.blocks.columnsBlockChildren.get(block.blockId) ?? []
      ).map((c) => ({
        span: c.span,
        blockId: c.childBlockId,
      })),
      ref: block.ref ?? undefined,
    };
    blocks.push(parsed);
  });
  ctx.data.blocks.listBlocks.forEach((block) => {
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
      blocks: ctx.data.blocks.listBlockChildren.get(block.blockId) ?? [],
      bullet,
      leftSpace: block.leftSpace ?? undefined,
      rightSpace: block.rightSpace ?? undefined,
      ref: block.ref ?? undefined,
    };

    blocks.push(parsed);
  });
  return blocks;
}

export function mapStyles(ctx: {
  data: Awaited<ReturnType<typeof getRetrieverContextData>>;
}): z.infer<typeof StyleSheetSchema> {
  // Deep copy of DEFAULT_STYLE_SHEET.text to avoid mutating the original object
  const textStyles = JSON.parse(
    JSON.stringify(DEFAULT_STYLE_SHEET.text)
  ) as z.infer<typeof TextStyleSheetSchema>;

  ctx.data.styles.textStyles.forEach((style) => {
    textStyles[style.style] = {
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontFamily: style.fontFamily,
      lineHeight: style.lineHeight,
    };
  });
  return {
    page: ctx.data.styles.pageStyles
      ? {
          gap: ctx.data.styles.pageStyles.gap,
          margins: {
            top: ctx.data.styles.pageStyles.marginTop,
            bottom: ctx.data.styles.pageStyles.marginBottom,
            left: ctx.data.styles.pageStyles.marginLeft,
            right: ctx.data.styles.pageStyles.marginRight,
          },
        }
      : DEFAULT_STYLE_SHEET.page,
    text: textStyles,
    list: ctx.data.styles.listStyles
      ? {
          leftSpace: ctx.data.styles.listStyles.leftSpace,
          rightSpace: ctx.data.styles.listStyles.rightSpace,
        }
      : DEFAULT_STYLE_SHEET.list,
  };
}
