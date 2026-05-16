"use client";

import { z } from "zod";
import { Group, Rect, Text } from "react-konva";
import { prepare, layout } from "@chenglou/pretext";
import type { ColumnsResizeContext } from "../renderer-types";
import {
  BlockRenderer,
  getEdgeReorderBoundingBoxes,
  REORDER_BOUNDING_BOX_TARGET_SIZE,
  REORDER_BOUNDING_BOX_VISUAL_SIZE,
} from "../renderer-types";
import { BlockSchema, DEFAULT_STYLE_SHEET } from "../blocks";
import { ListBlockSchema, ListBulletSchema } from "./schema";
import { useDocument } from "../document-context";
import { ContainerBlockFrame } from "../container-block-frame";
import type {
  BlockRenderLayoutResult,
  BlockRendererContext,
} from "../renderer-types";
import type { PdfDrawSurface } from "../pdf/pdf-draw-context-types";
import { drawLayoutTree } from "../pdf/draw-layout-tree";

function EmptyListBlockComponent({
  blockId,
  dimensions,
  pos,
  parents,
  columnsResizeContext,
}: {
  blockId: string;
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  parents: string[];
  columnsResizeContext?: ColumnsResizeContext;
}) {
  const { document, dpi } = useDocument();
  const defaultTextStyle =
    document?.styleSheet.text.default ?? DEFAULT_STYLE_SHEET.text.default;
  const fontSizePx = (defaultTextStyle.fontSize * dpi) / 72;

  return (
    <ContainerBlockFrame
      blockId={blockId}
      x={pos.x}
      y={pos.y}
      width={dimensions.width}
      height={dimensions.height}
      parents={parents}
      columnsResizeContext={columnsResizeContext}
      nodes={[
        <Rect
          key="bg"
          x={0}
          y={0}
          width={dimensions.width}
          height={dimensions.height}
          fill="#ffffff"
          stroke="#8a8a8a"
          strokeWidth={2}
          dash={[5, 5]}
          perfectDrawEnabled={false}
          listening={false}
        />,
        <Text
          key="label"
          x={0}
          y={0}
          width={dimensions.width}
          height={dimensions.height}
          text="Drag or add text block here"
          fontFamily={defaultTextStyle.fontFamily}
          fontSize={fontSizePx}
          lineHeight={defaultTextStyle.lineHeight}
          fontStyle={defaultTextStyle.fontWeight === "bold" ? "bold" : "normal"}
          align="center"
          verticalAlign="middle"
          fill="#9a9a9a"
          perfectDrawEnabled={false}
          listening={false}
        />,
      ]}
    />
  );
}

function ListBlockComponent({
  blockId,
  dimensions,
  pos,
  parents,
  nodes,
  columnsResizeContext,
}: {
  blockId: string;
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  parents: string[];
  nodes: React.ReactNode[];
  columnsResizeContext?: ColumnsResizeContext;
}) {
  return (
    <ContainerBlockFrame
      blockId={blockId}
      x={pos.x}
      y={pos.y}
      width={dimensions.width}
      height={dimensions.height}
      parents={parents}
      nodes={nodes}
      columnsResizeContext={columnsResizeContext}
    />
  );
}

function toAlphabeticalLabel(index: number): string {
  let remaining = index;
  let label = "";

  do {
    label = String.fromCharCode(97 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);

  return `${label}.`;
}

function getBulletLabel(
  bullet: z.infer<typeof ListBulletSchema>,
  index: number
): string {
  switch (bullet.type) {
    case "normal":
      return bullet.value;
    case "alphabetical":
      return toAlphabeticalLabel(index);
    case "numerical":
      return `${index + 1}.`;
  }
}

/** jsPDF built-in fonts cannot render common Unicode bullet glyphs (e.g. •). */
function getBulletTextForPdf(
  bullet: z.infer<typeof ListBulletSchema>,
  index: number
): string {
  const label = getBulletLabel(bullet, index);
  if (bullet.type !== "normal") {
    return label;
  }
  const normalized = label.replace(
    /[\u2022\u00b7\u25e6\u25aa\u25cf\u2043]/g,
    "-"
  );
  if (/^[-\s]+$/.test(normalized)) {
    return "-";
  }
  return normalized;
}

export const ListBlockRenderer: BlockRenderer<"list"> = {
  type: "list",
  render: (block, relativeTo, ctx) => {
    const childBlocks = block.blocks
      .map((id) => ctx.allBlocks.find((b) => b.id === id))
      .filter((b): b is z.infer<typeof BlockSchema> => b != null);
    if (childBlocks.length === 0) {
      const listStartPosition = {
        ...ctx.getNextPosition(),
        blockId: block.id,
        width: relativeTo.width,
      };
      const placeholderHeight = 96;
      ctx.claimBlockSpace(placeholderHeight);

      const dimensions = {
        x: listStartPosition.x,
        y: listStartPosition.y,
        width: relativeTo.width,
        height: placeholderHeight,
      };
      const listPosRelativeTo = {
        x: listStartPosition.x - relativeTo.x,
        y: listStartPosition.y - relativeTo.y,
      };

      const boundingBoxes = getEdgeReorderBoundingBoxes({
        blockId: block.id,
        from: { x: listStartPosition.x, y: listStartPosition.y },
        to: {
          x: listStartPosition.x + dimensions.width,
          y: listStartPosition.y + dimensions.height,
        },
        visualSize: REORDER_BOUNDING_BOX_VISUAL_SIZE,
        targetSize: REORDER_BOUNDING_BOX_TARGET_SIZE,
      });
      // Add inner bounding box.
      boundingBoxes.push({
        blockId: block.id,
        type: "inner",
        visual: {
          from: { x: listStartPosition.x, y: listStartPosition.y },
          to: {
            x: listStartPosition.x + dimensions.width,
            y: listStartPosition.y + dimensions.height,
          },
        },
        target: {
          from: { x: listStartPosition.x, y: listStartPosition.y },
          to: {
            x: listStartPosition.x + dimensions.width,
            y: listStartPosition.y + dimensions.height,
          },
        },
      });

      return {
        blockId: block.id,
        estimatedDimensions: dimensions,
        boundingBoxes,
        children: [],
        component: () => (
          <EmptyListBlockComponent
            blockId={block.id}
            dimensions={dimensions}
            pos={listPosRelativeTo}
            parents={relativeTo.parents}
            columnsResizeContext={relativeTo.columnsResizeContext}
          />
        ),
      };
    }

    const listStartPosition = {
      ...ctx.getNextPosition(),
      blockId: block.id,
      width: relativeTo.width,
    };
    const listSheet = ctx.styleSheet.list;
    const leftIn = block.leftSpace ?? listSheet.leftSpace;
    const rightIn = block.rightSpace ?? listSheet.rightSpace;
    const bulletWidth = leftIn * ctx.dpi;
    const betweenPx = rightIn * ctx.dpi;
    const contentWidth = Math.max(
      0,
      relativeTo.width - bulletWidth - betweenPx
    );

    const children: ReturnType<
      BlockRenderer<z.infer<typeof BlockSchema>["type"]>["render"]
    >[] = [];
    const nodes: React.ReactNode[] = [];
    const defaultTextStyle = ctx.styleSheet.text.default;

    childBlocks.forEach((childBlock, index) => {
      const rowStartPosition = ctx.getNextPosition();
      const bulletLabel = getBulletLabel(block.bullet, index);
      const bulletFontSizePx = (defaultTextStyle.fontSize * ctx.dpi) / 72;
      const PRETEXT_PREPARE_OPTIONS = { whiteSpace: "pre-wrap" as const };
      const bulletPrepared = prepare(
        bulletLabel,
        `${defaultTextStyle.fontWeight} ${bulletFontSizePx}px ${defaultTextStyle.fontFamily}`,
        PRETEXT_PREPARE_OPTIONS
      );
      const { lineCount: bulletLineCount } = layout(
        bulletPrepared,
        bulletWidth,
        defaultTextStyle.lineHeight
      );
      const bulletHeight =
        bulletLineCount * bulletFontSizePx * defaultTextStyle.lineHeight;

      ctx.setNextPosition({
        x: rowStartPosition.x,
        y: rowStartPosition.y,
      });
      ctx.claimBlockSpace(bulletHeight);
      const afterBulletPosition = ctx.getNextPosition();

      ctx.setNextPosition({
        x: rowStartPosition.x + bulletWidth + betweenPx,
        y: rowStartPosition.y,
      });
      const childRenderer = ctx.renderers[childBlock.type];
      if (!childRenderer) {
        throw new Error(
          `Renderer not found for block type: ${childBlock.type}`
        );
      }
      const childResult = childRenderer.render(
        childBlock as never,
        {
          parents: [...relativeTo.parents, block.id],
          x: listStartPosition.x,
          y: listStartPosition.y,
          width: contentWidth,
        },
        ctx
      );
      const afterChildPosition = ctx.getNextPosition();

      const rowHeight = Math.max(
        afterBulletPosition.y - rowStartPosition.y,
        afterChildPosition.y - rowStartPosition.y
      );

      ctx.setNextPosition({
        x: listStartPosition.x,
        y: rowStartPosition.y + rowHeight,
      });

      children.push(childResult);
      nodes.push(
        <Group key={childBlock.id}>
          <Text
            x={rowStartPosition.x - listStartPosition.x}
            y={rowStartPosition.y - listStartPosition.y}
            width={bulletWidth}
            height={bulletHeight}
            text={bulletLabel}
            fontFamily={defaultTextStyle.fontFamily}
            fontSize={bulletFontSizePx}
            lineHeight={defaultTextStyle.lineHeight}
            fontStyle={
              defaultTextStyle.fontWeight === "bold" ? "bold" : "normal"
            }
            align="right"
            fill="#000000"
            perfectDrawEnabled={false}
            listening={false}
          />
          {childResult.component()}
        </Group>
      );
    });

    const listEndPosition = ctx.getNextPosition();
    const dimensions = {
      x: listStartPosition.x,
      y: listStartPosition.y,
      width: relativeTo.width,
      height: listEndPosition.y - listStartPosition.y,
    };
    const listPosRelativeTo = {
      x: listStartPosition.x - relativeTo.x,
      y: listStartPosition.y - relativeTo.y,
    };

    return {
      blockId: block.id,
      estimatedDimensions: dimensions,
      boundingBoxes: getEdgeReorderBoundingBoxes({
        blockId: block.id,
        from: { x: listStartPosition.x, y: listStartPosition.y },
        to: {
          x: listStartPosition.x + dimensions.width,
          y: listStartPosition.y + dimensions.height,
        },
        visualSize: REORDER_BOUNDING_BOX_VISUAL_SIZE,
        targetSize: REORDER_BOUNDING_BOX_TARGET_SIZE,
      }),
      children: children,
      component: () => (
        <ListBlockComponent
          blockId={block.id}
          dimensions={dimensions}
          pos={listPosRelativeTo}
          parents={relativeTo.parents}
          columnsResizeContext={relativeTo.columnsResizeContext}
          nodes={nodes}
        />
      ),
    };
  },
  renderPdf(
    block: z.infer<typeof ListBlockSchema>,
    ctx: BlockRendererContext,
    pdf: PdfDrawSurface,
    layout: BlockRenderLayoutResult
  ) {
    if (block.blocks.length === 0) {
      return;
    }

    const listSheet = ctx.styleSheet.list;
    const leftIn = block.leftSpace ?? listSheet.leftSpace;
    const rightIn = block.rightSpace ?? listSheet.rightSpace;
    const bulletWidthPx = leftIn * ctx.dpi;
    const betweenPx = rightIn * ctx.dpi;
    const defaultTextStyle = ctx.styleSheet.text.default;
    const blocksById = new Map(ctx.allBlocks.map((entry) => [entry.id, entry]));

    layout.children.forEach((childLayout, index) => {
      const itemY = childLayout.estimatedDimensions.y;
      const itemBottom = itemY + childLayout.estimatedDimensions.height;
      const endListItem = pdf.beginMarkedGroup("LI", itemY);
      pdf.drawWrappedText({
        xPx: layout.estimatedDimensions.x,
        yPx: itemY,
        widthPx: bulletWidthPx,
        text: getBulletTextForPdf(block.bullet, index),
        style: defaultTextStyle,
        align: "right",
        tag: null,
      });

      const endBulletSpacer = pdf.beginMarkedGroup("SPAN", itemY);
      pdf.drawWrappedText({
        xPx: layout.estimatedDimensions.x + bulletWidthPx,
        yPx: itemY,
        widthPx: betweenPx,
        text: " ",
        style: defaultTextStyle,
        align: "left",
        tag: null,
      });
      endBulletSpacer();

      pdf.withSuppressedTextMark(() => {
        drawLayoutTree({
          layout: childLayout,
          renderContext: ctx,
          pdf,
          blocksById,
        });
      });
      pdf.setPageForY(itemBottom);
      endListItem();
    });
  },
};
