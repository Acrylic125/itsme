"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Html } from "react-konva-utils";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";
import { z } from "zod";
import type { ColumnsResizeContext } from "../renderer-types";
import {
  BlockRenderer,
  getEdgeReorderBoundingBoxes,
  REORDER_BOUNDING_BOX_TARGET_SIZE,
  REORDER_BOUNDING_BOX_VISUAL_SIZE,
} from "../renderer-types";
import {
  documentActionOf,
  selectActiveBlockId,
  useDocument,
} from "../document-context";
import {
  getNormalizedAnchorRectForKonvaNode,
  InteractableBlock,
  useInteractableBlock,
} from "@/components/shared-block";
import type { AnchorRect } from "@/components/dom-popup";
import { SpacerBlockSchema } from "./schema";
import {
  clampSpacerHeightPx,
  EditSpacerToolbar,
} from "./edit-spacer-toolbar";

function SpacerBlockComponent({
  block,
  dimensions,
  pos,
  parents,
  columnsResizeContext,
}: {
  block: z.infer<typeof SpacerBlockSchema>;
  dimensions: { width: number; height: number };
  parents: string[];
  pos: {
    relativeTo: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  columnsResizeContext?: ColumnsResizeContext;
}) {
  const { documentStore, blockTree, updateBlocks } = useDocument();
  const { setAction, focusAction, activeBlockId } = useStore(
    documentStore,
    useShallow((s) => ({
      setAction: s.setAction,
      focusAction: documentActionOf(s.action, "focus-block"),
      activeBlockId: selectActiveBlockId(s),
    }))
  );

  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const canvasGroupRef = useRef<Konva.Group | null>(null);
  const inFocus = focusAction?.blockId === block.id;
  const resolvedHeightPx = clampSpacerHeightPx(block.height);
  const [heightDraftPx, setHeightDraftPx] = useState(resolvedHeightPx);
  const heightPx = heightDraftPx;

  useEffect(() => {
    if (!inFocus) {
      setHeightDraftPx(resolvedHeightPx);
    }
  }, [inFocus, resolvedHeightPx]);

  const persistHeight = useCallback(
    (nextHeightPx: number) => {
      const heightSafe = clampSpacerHeightPx(nextHeightPx);
      let prevHeight: number | null = null;

      updateBlocks(
        (current) => {
          const currentBlock = current.blocks.find(
            (b) => b.id === block.id && b.type === "spacer"
          );
          if (!currentBlock || currentBlock.type !== "spacer") {
            return current;
          }
          prevHeight = currentBlock.height;
          return {
            ...current,
            blocks: current.blocks.map((existing) =>
              existing.id === block.id && existing.type === "spacer"
                ? { ...existing, height: heightSafe }
                : existing
            ),
          };
        },
        {
          down: () => {
            if (prevHeight == null) return;
            const rollback = prevHeight;
            updateBlocks((current) => ({
              ...current,
              blocks: current.blocks.map((existing) =>
                existing.id === block.id && existing.type === "spacer"
                  ? { ...existing, height: rollback }
                  : existing
              ),
            }));
          },
        }
      );
    },
    [block.id, updateBlocks]
  );

  useLayoutEffect(() => {
    if (!inFocus || anchor) return;
    const syncAnchor = () => {
      const node = canvasGroupRef.current;
      if (!node) return;
      const rect = getNormalizedAnchorRectForKonvaNode(node);
      if (rect) setAnchor(rect);
    };
    syncAnchor();
    const frame = requestAnimationFrame(syncAnchor);
    return () => cancelAnimationFrame(frame);
  }, [anchor, block.id, inFocus]);

  const closeSpacerFocus = useCallback(() => {
    setHeightDraftPx(resolvedHeightPx);
    setAnchor(null);
    setAction((current) => {
      const focus = documentActionOf(current, "focus-block");
      return focus?.blockId === block.id ? null : current;
    });
  }, [block.id, resolvedHeightPx, setAction]);

  const handleClick = useCallback(
    (args: { anchor: AnchorRect }) => {
      setAnchor(args.anchor);
      setAction({ type: "focus-block", blockId: block.id });
    },
    [block.id, setAction]
  );

  useEffect(() => {
    if (!inFocus) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSpacerFocus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeSpacerFocus, inFocus]);

  const isDisabled = useInteractableBlock({
    activeBlockId,
    parents,
    blockId: block.id,
    blockTree,
  });

  const interactiveHeight = inFocus ? heightPx : dimensions.height;

  return (
    <InteractableBlock
      blockId={block.id}
      x={pos.relativeTo.x}
      y={pos.relativeTo.y}
      width={dimensions.width}
      height={interactiveHeight}
      disabled={isDisabled}
      inFocus={inFocus}
      blockHotkeyScope="focus-block-only"
      columnsResizeContext={columnsResizeContext}
      onKonvaGroupRef={(node) => {
        canvasGroupRef.current = node;
      }}
      onClick={handleClick}
    >
      {anchor && inFocus ? (
        <Html
          transform={false}
          divProps={{
            style: {
              position: "absolute",
              top: anchor.top * 100 + "%",
              left: anchor.left * 100 + "%",
              width: anchor.width * 100 + "%",
            },
          }}
        >
          <div className="relative h-0 w-full">
            <EditSpacerToolbar
              block={block}
              heightPx={heightPx}
              onClose={closeSpacerFocus}
              onHeightPxCommit={(next) =>
                setHeightDraftPx(clampSpacerHeightPx(next))
              }
              persistHeight={persistHeight}
            />
          </div>
        </Html>
      ) : null}
    </InteractableBlock>
  );
}

export const SpacerBlockRenderer: BlockRenderer<"spacer"> = {
  type: "spacer",
  render: (block, relativeTo, ctx) => {
    const height = clampSpacerHeightPx(block.height);
    const dimensions = {
      x: 0,
      y: 0,
      width: relativeTo.width,
      height,
    };

    const pos = ctx.claimBlockSpace(dimensions.height);
    dimensions.x = pos.canvas.from.x;
    dimensions.y = pos.canvas.from.y;

    const posRelativeTo = {
      parents: [...relativeTo.parents, block.id],
      x: pos.canvas.from.x - relativeTo.x,
      y: pos.canvas.from.y - relativeTo.y,
      width: relativeTo.width,
      height: dimensions.height,
    };

    return {
      blockId: block.id,
      estimatedDimensions: dimensions,
      boundingBoxes: getEdgeReorderBoundingBoxes({
        blockId: block.id,
        from: pos.canvas.from,
        to: {
          x: pos.canvas.from.x + dimensions.width,
          y: pos.canvas.from.y + dimensions.height,
        },
        visualSize: REORDER_BOUNDING_BOX_VISUAL_SIZE,
        targetSize: REORDER_BOUNDING_BOX_TARGET_SIZE,
      }),
      children: [],
      component: () => (
        <SpacerBlockComponent
          block={{ ...block, height }}
          dimensions={dimensions}
          parents={relativeTo.parents}
          pos={{ relativeTo: posRelativeTo }}
          columnsResizeContext={relativeTo.columnsResizeContext}
        />
      ),
    };
  },
  renderPdf(
    _block: z.infer<typeof SpacerBlockSchema>,
    _ctx,
    _pdf,
    _layout
  ) {
    // Vertical space is reserved during layout; nothing to draw.
  },
};
