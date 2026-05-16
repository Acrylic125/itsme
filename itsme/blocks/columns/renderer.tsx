"use client";

import { Fragment } from "react";
import type { ColumnsResizeContext } from "../renderer-types";
import {
  BlockRenderer,
  getEdgeReorderBoundingBoxes,
  REORDER_BOUNDING_BOX_TARGET_SIZE,
  REORDER_BOUNDING_BOX_VISUAL_SIZE,
} from "../renderer-types";
import {
  InteractableBlock,
  useInteractableBlock,
} from "@/components/shared-block";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";
import {
  selectActiveBlockId,
  selectFocusBlockId,
  useDocument,
} from "../document-context";

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
  const { documentStore, blockTree } = useDocument();
  const { setAction, focusBlockId, activeBlockId } = useStore(
    documentStore,
    useShallow((s) => ({
      setAction: s.setAction,
      focusBlockId: selectFocusBlockId(s),
      activeBlockId: selectActiveBlockId(s),
    }))
  );

  const isDisabled = useInteractableBlock({
    activeBlockId,
    parents,
    blockId,
    blockTree,
  });

  return (
    <InteractableBlock
      blockId={blockId}
      x={pos.x}
      y={pos.y}
      width={dimensions.width}
      height={dimensions.height}
      disabled={isDisabled}
      inFocus={focusBlockId === blockId}
      columnsResizeContext={columnsResizeContext}
      onClick={() => setAction({ type: "edit-block", blockId })}
    >
      {nodes}
    </InteractableBlock>
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
};
