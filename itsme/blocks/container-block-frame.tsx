"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Html } from "react-konva-utils";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";
import type { ColumnsResizeContext } from "./renderer-types";
import {
  InteractableBlock,
  getNormalizedAnchorRectForKonvaNode,
  useInteractableBlock,
} from "@/components/shared-block";
import type { AnchorRect } from "@/components/dom-popup";
import {
  documentActionOf,
  selectActiveBlockId,
  selectFocusBlockId,
  useDocument,
} from "./document-context";
import { ContainerBlockToolbar } from "./container-block-toolbar";

export function ContainerBlockFrame({
  blockId,
  x,
  y,
  width,
  height,
  parents,
  nodes,
  columnsResizeContext,
  onClick,
}: {
  blockId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parents: string[];
  nodes: React.ReactNode[];
  columnsResizeContext?: ColumnsResizeContext;
  onClick?: () => void;
}) {
  const { documentStore, blockTree, document } = useDocument();
  const { setAction, focusBlockId, activeBlockId, action } = useStore(
    documentStore,
    useShallow((s) => ({
      setAction: s.setAction,
      focusBlockId: selectFocusBlockId(s),
      action: s.action,
      activeBlockId: selectActiveBlockId(s),
    }))
  );

  const isDisabled = useInteractableBlock({
    activeBlockId,
    parents,
    blockId,
    blockTree,
  });

  const editAction = documentActionOf(action, "edit-block");
  const focusAction = documentActionOf(action, "focus-block");
  const toolbarVisible =
    editAction?.blockId === blockId || focusAction?.blockId === blockId;

  const block = useMemo(
    () => document?.blocks.find((b) => b.id === blockId) ?? null,
    [blockId, document?.blocks]
  );

  const canvasGroupRef = useRef<Konva.Group | null>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);

  useLayoutEffect(() => {
    if (!toolbarVisible) {
      return;
    }

    const syncAnchor = () => {
      const node = canvasGroupRef.current;
      if (!node) {
        return;
      }
      const rect = getNormalizedAnchorRectForKonvaNode(node);
      if (rect) {
        setAnchor(rect);
      }
    };

    syncAnchor();
    const frame = requestAnimationFrame(syncAnchor);
    return () => cancelAnimationFrame(frame);
  }, [blockId, toolbarVisible]);

  return (
    <InteractableBlock
      blockId={blockId}
      x={x}
      y={y}
      width={width}
      height={height}
      disabled={isDisabled}
      inFocus={focusBlockId === blockId || editAction?.blockId === blockId}
      columnsResizeContext={columnsResizeContext}
      onKonvaGroupRef={(node) => {
        canvasGroupRef.current = node;
      }}
      onClick={onClick ?? (() => setAction({ type: "edit-block", blockId }))}
    >
      {nodes}
      {anchor && toolbarVisible && block ? (
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
            <ContainerBlockToolbar block={block} />
          </div>
        </Html>
      ) : null}
    </InteractableBlock>
  );
}
