"use client";

import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";
import type { ColumnsResizeContext } from "./renderer-types";
import {
  InteractableBlock,
  useInteractableBlock,
} from "@/components/shared-block";
import {
  selectActiveBlockId,
  selectFocusBlockId,
  useDocument,
} from "./document-context";

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
      x={x}
      y={y}
      width={width}
      height={height}
      disabled={isDisabled}
      inFocus={focusBlockId === blockId}
      columnsResizeContext={columnsResizeContext}
      onClick={onClick ?? (() => setAction({ type: "edit-block", blockId }))}
    >
      {nodes}
    </InteractableBlock>
  );
}
