"use client";

import { Fragment } from "react";
import { z } from "zod";
import { Group } from "react-konva";
import { BlockRenderer, BlockTree } from "../renderer-types";
import { BlockSchema } from "../blocks";
import { HoverRegion, ReorderRegion } from "@/components/shared-block";
import { useDocumentStores } from "../document-context";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";

function SectionBlockComponent({
  blockId,
  dimensions,
  pos,
  parents,
  blockTree,
  nodes,
}: {
  blockId: string;
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  parents: string[];
  blockTree: BlockTree;
  nodes: React.ReactNode[];
}) {
  const { documentStore } = useDocumentStores();
  const { focusBlock } = useStore(
    documentStore,
    useShallow((s) => ({
      focusBlock: s.focusBlock,
    }))
  );
  const focusedBlockId = useStore(documentStore, (s) => s.focusBlockId);

  let isDisabled;
  if (focusedBlockId !== null) {
    // Top level, can still focus. But not if it's child is focused.
    if (parents.length === 0) {
      isDisabled = blockTree.isNodeParentOf({
        parent: blockId,
        child: focusedBlockId,
      });
    } else {
      isDisabled = parents[parents.length - 1] !== focusedBlockId;
      // If parent block is not focused, we try to see if the current block
      if (isDisabled) {
        isDisabled =
          parents[parents.length - 1] !==
          blockTree.getDirectParentOf(focusedBlockId);
      }
    }
  } else {
    isDisabled = parents.length > 0;
  }

  return (
    <HoverRegion
      x={pos.x}
      y={pos.y}
      width={dimensions.width}
      height={dimensions.height}
      disabled={isDisabled}
      inFocus={focusedBlockId === blockId}
      onClick={() => focusBlock(blockId)}
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

export const SectionBlockRenderer: BlockRenderer<"section"> = {
  type: "section",
  render: (block, relativeTo, ctx) => {
    const childBlocks = block.blocks
      .map((id) => ctx.allBlocks.find((b) => b.id === id))
      .filter((b): b is z.infer<typeof BlockSchema> => b != null);

    const sectionStartPosition = {
      ...ctx.getNextPosition(),
      parents: [...relativeTo.parents, block.id],
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
          blockId={block.id}
          dimensions={dimensions}
          pos={sectionPosRelativeTo}
          parents={relativeTo.parents}
          blockTree={ctx.blockTree}
          nodes={children}
        />
      ),
    };
  },
};
