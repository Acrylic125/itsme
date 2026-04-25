"use client";

import { z } from "zod";
import { Group } from "react-konva";
import { BlockRenderer } from "../renderer-types";
import { BlockSchema } from "../blocks";
import { ListBulletSchema } from "./schema";
import { TextBlockSchema } from "../text/schema";
import { HoverRegion, ReorderRegion } from "@/components/shared-block";

function ListBlockComponent({
  blockId,
  dimensions,
  pos,
  nodes,
}: {
  blockId: string;
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  nodes: React.ReactNode[];
}) {
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
        <Group width={dimensions.width} height={dimensions.height}>
          {nodes}
        </Group>
      </ReorderRegion>
    </HoverRegion>
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

export const ListBlockRenderer: BlockRenderer<"list"> = {
  type: "list",
  render: (block, relativeTo, ctx) => {
    const childBlocks = block.blocks
      .map((id) => ctx.allBlocks.find((b) => b.id === id))
      .filter((b): b is z.infer<typeof BlockSchema> => b != null);

    const listStartPosition = {
      ...ctx.getNextPosition(),
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

    const children = childBlocks.map((childBlock, index) => {
      const rowStartPosition = ctx.getNextPosition();
      const bulletBlock: z.infer<typeof TextBlockSchema> = {
        id: `${block.id}-bullet-${index}`,
        type: "text",
        text: getBulletLabel(block.bullet, index),
        style: "default",
        align: "right",
      };

      ctx.setNextPosition({
        x: rowStartPosition.x,
        y: rowStartPosition.y,
      });
      const bulletResult = ctx.renderers.text.render(
        bulletBlock,
        {
          x: listStartPosition.x,
          y: listStartPosition.y,
          width: bulletWidth,
        },
        ctx
      );
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

      return (
        <Group key={childBlock.id}>
          {bulletResult.component()}
          {childResult.component()}
        </Group>
      );
    });

    const listEndPosition = ctx.getNextPosition();
    const dimensions = {
      width: relativeTo.width,
      height: listEndPosition.y - listStartPosition.y,
    };
    const listPosRelativeTo = {
      x: listStartPosition.x - relativeTo.x,
      y: listStartPosition.y - relativeTo.y,
    };

    return {
      estimatedDimensions: dimensions,
      component: () => (
        <ListBlockComponent
          blockId={block.id}
          dimensions={dimensions}
          pos={listPosRelativeTo}
          nodes={children}
        />
      ),
    };
  },
};
