"use client";

import { Fragment } from "react";
import { z } from "zod";
import { Group } from "react-konva";
import { BlockRenderer } from "../renderer-types";
import { BlockSchema } from "../blocks";

function SectionBlockComponent({
  dimensions,
  pos,
  nodes,
}: {
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  nodes: React.ReactNode[];
}) {
  return (
    <Group
      x={pos.x}
      y={pos.y}
      width={dimensions.width}
      height={dimensions.height}
    >
      {nodes}
    </Group>
  );
}

export const SectionBlockRenderer: BlockRenderer<"section"> = {
  type: "section",
  render: (block, relativeTo, ctx) => {
    const childBlocks = block.blocks
      .map((id) => ctx.allBlocks.find((b) => b.id === id))
      .filter((b): b is z.infer<typeof BlockSchema> => b != null);

    const sectionStartPosition = {
      ...ctx.getNextPosition(),
      width: relativeTo.width,
    };
    // Child components will do the space claiming.
    const children = childBlocks.map((b) => {
      const renderer = ctx.renderers[b.type];
      if (!renderer) {
        throw new Error(`Renderer not found for block type: ${b.type}`);
      }
      // I hate this.
      const result = renderer.render(b as never, sectionStartPosition, ctx);
      return <Fragment key={b.id}>{result.component()}</Fragment>;
    });
    const sectionEndPosition = ctx.getNextPosition();

    const dimensions = {
      width: relativeTo.width,
      height: sectionEndPosition.y - sectionStartPosition.y,
    };

    // Groups are relative the their parent, so we need to adjust the position to be relative to the parent.
    const sectionPosRelativeTo = {
      x: sectionStartPosition.x - relativeTo.x,
      y: sectionStartPosition.y - relativeTo.y,
    };

    return {
      estimatedDimensions: dimensions,
      component: () => (
        <SectionBlockComponent
          dimensions={dimensions}
          pos={sectionPosRelativeTo}
          nodes={children}
        />
      ),
    };
  },
};
