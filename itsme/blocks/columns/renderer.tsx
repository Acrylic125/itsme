"use client";

import { Fragment } from "react";
import { BlockRenderer } from "../renderer-types";
import {
  InteractableBlock,
  useInteractableBlock,
} from "@/components/shared-block";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";
import { useDocument } from "../document-context";

function ColumnsBlockComponent({
  dimensions,
  pos,
  parents,
  nodes,
  blockId,
}: {
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  parents: string[];
  nodes: React.ReactNode[];
  blockId: string;
}) {
  const { documentStore, blockTree } = useDocument();
  const { focusBlock, focusBlockId } = useStore(
    documentStore,
    useShallow((s) => ({
      focusBlock: s.focusBlock,
      focusBlockId: s.focusBlockId,
    }))
  );

  const isDisabled = useInteractableBlock({
    focusBlockId,
    parents,
    blockId,
    blockTree,
  });

  return (
    <InteractableBlock
      x={pos.x}
      y={pos.y}
      width={dimensions.width}
      height={dimensions.height}
      disabled={isDisabled}
      inFocus={focusBlockId === blockId}
      onClick={() => focusBlock(blockId)}
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
    const children = childBlocks.map((b) => {
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
      boundingBoxes: [],
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
        />
      ),
    };
  },
};
