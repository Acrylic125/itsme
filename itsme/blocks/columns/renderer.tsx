"use client";

import { z } from "zod";
import { Fragment } from "react";
import type { ColumnsResizeContext } from "../renderer-types";
import {
  BlockRenderer,
  getEdgeReorderBoundingBoxes,
  REORDER_BOUNDING_BOX_TARGET_SIZE,
  REORDER_BOUNDING_BOX_VISUAL_SIZE,
} from "../renderer-types";
import { ContainerBlockFrame } from "../container-block-frame";
import type {
  BlockRenderLayoutResult,
  BlockRendererContext,
} from "../renderer-types";
import type { PdfDrawSurface } from "../pdf/pdf-draw-context-types";
import { mapTextStyleToPdfTag } from "../pdf/types";
import type { TextBlockSchema } from "../text/schema";

function ColumnsBlockComponent({
  dimensions,
  pos,
  parents,
  nodes,
  blockId,
  columnsResizeContext,
}: {
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  parents: string[];
  nodes: React.ReactNode[];
  blockId: string;
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

export const ColumnsBlockRenderer: BlockRenderer<"columns"> = {
  type: "columns",
  render: (block, relativeTo, ctx) => {
    const childBlocks = block.blocks
      .map((bb) => {
        const b = ctx.allBlocks.find((b) => b.id === bb.blockId);
        if (!b) {
          return null;
        }
        return {
          block: b,
          span: bb.span,
        };
      })
      .filter((b) => b !== null);

    const groupStartPosition = {
      ...ctx.getNextPosition(),
      parents: [...relativeTo.parents, block.id],
      width: relativeTo.width,
    };

    const cursor = {
      x: groupStartPosition.x,
      y: groupStartPosition.y,
    };
    let maxOffsetY = 0;
    const tallySpans = childBlocks.reduce((acc, b) => acc + b.span, 0);
    // Child components will do the space claiming.
    const children = childBlocks.map((b, childIndex) => {
      const renderer = ctx.renderers[b.block.type];
      if (!renderer) {
        throw new Error(`Renderer not found for block type: ${b.block.type}`);
      }

      // Bind cursor.
      ctx.setNextPosition(cursor);
      const spanWidth =
        tallySpans > 0 ? relativeTo.width * (b.span / tallySpans) : 0;
      // I hate this.
      const result = renderer.render(
        b.block as never,
        {
          // Children should position themselves relative to the columns group,
          // not relative to their own column cursor. The cursor still drives
          // `claimBlockSpace()` via ctx.setNextPosition(cursor).
          x: groupStartPosition.x,
          y: groupStartPosition.y,
          width: spanWidth,
          parents: [...relativeTo.parents, block.id],
          columnsResizeContext:
            tallySpans > 0 && childBlocks.length > 0
              ? {
                  columnsBlockId: block.id,
                  columnRowWidthPx: relativeTo.width,
                  totalSpan: tallySpans,
                  childIndex,
                  siblingCount: childBlocks.length,
                }
              : undefined,
        },
        ctx
      );
      const afterAddingPosition = ctx.getNextPosition();
      const componentTakesY = afterAddingPosition.y - cursor.y;
      maxOffsetY = Math.max(maxOffsetY, componentTakesY);
      cursor.x += spanWidth;
      return result;
    });
    ctx.setNextPosition({
      x: groupStartPosition.x,
      y: groupStartPosition.y + maxOffsetY,
    });

    const dimensions = {
      x: groupStartPosition.x,
      y: groupStartPosition.y,
      width: relativeTo.width,
      height: maxOffsetY,
    };

    // Groups are relative to their parent, so adjust to be relative to the parent.
    const sectionPosRelativeTo = {
      x: groupStartPosition.x - relativeTo.x,
      y: groupStartPosition.y - relativeTo.y,
    };

    // const columnSpans = childBlocks.map((b) => b.span);
    // const childBlockIds = childBlocks.map((b) => b.block.id);

    return {
      blockId: block.id,
      estimatedDimensions: dimensions,
      boundingBoxes: getEdgeReorderBoundingBoxes({
        blockId: block.id,
        from: { x: groupStartPosition.x, y: groupStartPosition.y },
        to: {
          x: groupStartPosition.x + dimensions.width,
          y: groupStartPosition.y + dimensions.height,
        },
        visualSize: REORDER_BOUNDING_BOX_VISUAL_SIZE,
        targetSize: REORDER_BOUNDING_BOX_TARGET_SIZE,
      }),
      children: children,
      component: () => (
        <ColumnsBlockComponent
          dimensions={dimensions}
          pos={sectionPosRelativeTo}
          parents={relativeTo.parents}
          nodes={children.map((c) => (
            <Fragment key={c.blockId}>{c.component()}</Fragment>
          ))}
          blockId={block.id}
          columnsResizeContext={relativeTo.columnsResizeContext}
        />
      ),
    };
  },
  renderPdf(
    block,
    ctx: BlockRendererContext,
    pdf: PdfDrawSurface,
    layout: BlockRenderLayoutResult
  ) {
    if (layout.children.length < 2) {
      pdf.withSuppressedTextMark(() => {
        for (const childLayout of layout.children) {
          const childBlock = ctx.allBlocks.find(
            (entry) => entry.id === childLayout.blockId
          );
          if (!childBlock) continue;
          const childRenderer = ctx.renderers[childBlock.type];
          childRenderer.renderPdf(
            childBlock as never,
            ctx,
            pdf,
            childLayout as never
          );
        }
      });
      return;
    }

    const leftLayout = layout.children[0]!;
    const rightLayout = layout.children[1]!;
    const leftBlock = ctx.allBlocks.find(
      (entry) => entry.id === leftLayout.blockId
    );
    const rightBlock = ctx.allBlocks.find(
      (entry) => entry.id === rightLayout.blockId
    );
    const rowTag =
      leftBlock?.type === "text"
        ? mapTextStyleToPdfTag(
            (leftBlock as z.infer<typeof TextBlockSchema>).style
          )
        : "P";
    const spacerStyle =
      ctx.styleSheet.text[
        leftBlock?.type === "text"
          ? (leftBlock as z.infer<typeof TextBlockSchema>).style
          : "default"
      ];

    const rowY = leftLayout.estimatedDimensions.y;
    const rowBottom = Math.max(
      leftLayout.estimatedDimensions.y + leftLayout.estimatedDimensions.height,
      rightLayout.estimatedDimensions.y + rightLayout.estimatedDimensions.height
    );
    const endRow = pdf.beginMarkedGroup(rowTag, rowY);

    if (leftBlock) {
      pdf.withSuppressedTextMark(() => {
        const leftRenderer = ctx.renderers[leftBlock.type];
        leftRenderer.renderPdf(
          leftBlock as never,
          ctx,
          pdf,
          leftLayout as never
        );
      });
    }

    const leftRight =
      leftLayout.estimatedDimensions.x + leftLayout.estimatedDimensions.width;
    const spacerWidth = Math.max(
      1,
      rightLayout.estimatedDimensions.x - leftRight
    );
    const endSpan = pdf.beginMarkedGroup("SPAN", rowY);
    pdf.drawWrappedText({
      xPx: leftRight,
      yPx: rowY,
      widthPx: spacerWidth,
      text: " ",
      style: spacerStyle,
      align: "left",
      tag: null,
    });
    endSpan();

    if (rightBlock) {
      pdf.withSuppressedTextMark(() => {
        const rightRenderer = ctx.renderers[rightBlock.type];
        rightRenderer.renderPdf(
          rightBlock as never,
          ctx,
          pdf,
          rightLayout as never
        );
      });
    }

    pdf.setPageForY(rowBottom);
    endRow();
  },
};
