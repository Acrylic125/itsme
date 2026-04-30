"use client";

import { Fragment } from "react";
import { z } from "zod";
import { BlockRenderer } from "../renderer-types";
import { BlockSchema } from "../blocks";
import {
  InteractableBlock,
  useInteractableBlock,
} from "@/components/shared-block";
import { useDocument } from "../document-context";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";

function SectionBlockComponent({
  blockId,
  dimensions,
  pos,
  parents,
  nodes,
}: {
  blockId: string;
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  parents: string[];
  nodes: React.ReactNode[];
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
      const result = renderer.render(b as never, sectionStartPosition, ctx);
      return result;
      // return <Fragment key={b.id}>{result.component()}</Fragment>;
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
      blockId: block.id,
      estimatedDimensions: dimensions,
      boundingBoxes: [],
      children: children,
      component: () => (
        <SectionBlockComponent
          blockId={block.id}
          dimensions={dimensions}
          pos={sectionPosRelativeTo}
          parents={relativeTo.parents}
          nodes={children.map((c) => (
            <Fragment key={c.blockId}>{c.component()}</Fragment>
          ))}
        />
      ),
    };
  },
};
