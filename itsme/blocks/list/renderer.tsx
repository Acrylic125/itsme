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
import { ListBulletSchema } from "./schema";
import {
  InteractableBlock,
  useInteractableBlock,
} from "@/components/shared-block";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import {
  selectActiveBlockId,
  selectFocusBlockId,
  useDocument,
} from "../document-context";

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
  const { documentStore, blockTree, document, dpi } = useDocument();
  const defaultTextStyle =
    document?.styleSheet.text.default ?? DEFAULT_STYLE_SHEET.text.default;
  const fontSizePx = (defaultTextStyle.fontSize * dpi) / 72;
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
      <Rect
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
      />
      <Text
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
      />
    </InteractableBlock>
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
};
