"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import { Group } from "react-konva";
import Konva from "konva";
import { BlockRenderer } from "../renderer-types";
import { HoverRegion, ReorderRegion } from "@/components/shared-block";

function ColumnsBlockComponent({
  dimensions,
  pos,
  nodes,
  blockId,
  totalSpan,
  columnSpans,
  childBlockIds,
}: {
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  nodes: React.ReactNode[];
  blockId: string;
  totalSpan: number;
  columnSpans: number[];
  childBlockIds: string[];
}) {
  const groupRef = useRef<Konva.Group | null>(null);

  return (
    <HoverRegion
      x={pos.x}
      y={pos.y}
      width={dimensions.width}
      height={dimensions.height}
      blockId={blockId}
    >
      <ReorderRegion
        blockId={blockId}
        width={dimensions.width}
        height={dimensions.height}
      >
        <Group
          ref={(n) => {
            groupRef.current = n;
          }}
          width={dimensions.width}
          height={dimensions.height}
        >
          {nodes}
        </Group>
      </ReorderRegion>
    </HoverRegion>
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
        },
        ctx
      );
      const afterAddingPosition = ctx.getNextPosition();
      const componentTakesY = afterAddingPosition.y - cursor.y;
      maxOffsetY = Math.max(maxOffsetY, componentTakesY);
      cursor.x += spanWidth;
      return <Fragment key={b.block.id}>{result.component()}</Fragment>;
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

    const columnSpans = childBlocks.map((b) => b.span);
    const childBlockIds = childBlocks.map((b) => b.block.id);

    return {
      estimatedDimensions: dimensions,
      component: () => (
        <ColumnsBlockComponent
          dimensions={dimensions}
          pos={sectionPosRelativeTo}
          nodes={children}
          blockId={block.id}
          totalSpan={tallySpans}
          columnSpans={columnSpans}
          childBlockIds={childBlockIds}
        />
      ),
    };
  },
};
