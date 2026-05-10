"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Rect } from "react-konva";
import Konva from "konva";
import { BlockTree, type ColumnsResizeContext } from "@/blocks/renderer-types";
import { buildMoveUpdatesForReorder } from "@/components/canvas-reorder-target-layer";
import {
  useDocument,
  asMoveBlockAction,
  asResizeColumnAction,
  selectMoveBlockAction,
  selectResizeColumnAction,
  type DocumentStoreResizeColumnAction,
  type DocumentStoreState,
} from "@/blocks/document-context";
import { useStore } from "zustand/react";
// import { useBlockDragContext } from "./block-dnd-context";
// import { useBlockFocusContext } from "./block-focus-context";

export function useInteractableBlock({
  activeBlockId,
  parents,
  blockId,
  blockTree,
}: {
  /**
   * The block the user is currently interacting with (edit or drag). Drives
   * the sibling/parent gating for which blocks can respond to input. Pass
   * `selectActiveBlockId(state)` rather than `selectFocusBlockId(state)` so
   * nested blocks stay enabled while they're being dragged.
   */
  activeBlockId: string | null;
  parents: string[];
  blockId: string;
  blockTree: BlockTree;
}) {
  let isDisabled;
  if (activeBlockId !== null) {
    // Top level, can still focus. But not if it's child is focused.
    if (parents.length === 0) {
      isDisabled = blockTree.isNodeParentOf({
        parent: blockId,
        child: activeBlockId,
      });
    } else {
      isDisabled = parents[parents.length - 1] !== activeBlockId;
      // If parent block is not focused, we try to see if the current block
      if (isDisabled) {
        isDisabled =
          parents[parents.length - 1] !==
          blockTree.getDirectParentOf(activeBlockId);
      }
    }
  } else {
    isDisabled = parents.length > 0;
  }

  return isDisabled;
}

const COLUMN_RESIZE_EDGE_PX = 22;
const MIN_COLUMN_SPAN = 0.1;
/** Small box centered on the left/right border (resize affordance). */
const COLUMN_RESIZE_GRIP_WIDTH = 24;
const COLUMN_RESIZE_GRIP_HEIGHT_MIN = 24;
const COLUMN_RESIZE_GRIP_HEIGHT_MAX = 24;

type NormalizedAnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Move the boundary between neighbors; positive delta means the boundary moves right. */
function transferSpansBetweenNeighbors(
  spans: readonly number[],
  leftIdx: number,
  rightIdx: number,
  deltaSpan: number,
  minSpan: number
): number[] {
  const out = [...spans];
  out[leftIdx] = spans[leftIdx]! + deltaSpan;
  out[rightIdx] = spans[rightIdx]! - deltaSpan;
  if (out[leftIdx]! < minSpan) {
    const fix = minSpan - out[leftIdx]!;
    out[leftIdx] = minSpan;
    out[rightIdx] = out[rightIdx]! - fix;
  }
  if (out[rightIdx]! < minSpan) {
    const fix = minSpan - out[rightIdx]!;
    out[rightIdx] = minSpan;
    out[leftIdx] = out[leftIdx]! - fix;
  }
  return out;
}

function normalizedAnchorRectForNode(
  node: Konva.Node
): NormalizedAnchorRect | null {
  const stage = node.getStage();
  const container = stage?.container();
  if (!stage || !container) return null;

  const stageRect = container.getBoundingClientRect();
  const r = node.getClientRect();
  return {
    left: r.x / stageRect.width,
    top: (r.y + r.height) / stageRect.height,
    width: r.width / stageRect.width,
    height: r.height / stageRect.height,
  };
}

function resetNodeDragPosition(
  node: Konva.Node,
  startPos: { x: number; y: number }
) {
  node.position({ x: startPos.x, y: startPos.y });
  node.getLayer()?.batchDraw();
}

function hitColumnResizeEdge(
  localX: number,
  blockWidth: number,
  ctx: ColumnsResizeContext
): "left" | "right" | null {
  const edgePx = Math.min(COLUMN_RESIZE_EDGE_PX, Math.max(blockWidth / 3, 8));
  const idx = ctx.childIndex;
  const n = ctx.siblingCount;
  const distLeft = localX;
  const distRight = blockWidth - localX;
  const hitLeft = idx > 0 && distLeft <= edgePx;
  const hitRight = idx < n - 1 && distRight <= edgePx;
  if (hitLeft && hitRight) {
    return distLeft <= distRight ? "left" : "right";
  }
  if (hitLeft) return "left";
  if (hitRight) return "right";
  return null;
}

function patchColumnSpansAfterResizeDrag(args: {
  dx: number;
  resizeKind: "left" | "right";
  resizeCtx: ColumnsResizeContext;
  documentBlocks: NonNullable<ReturnType<typeof useDocument>["document"]>;
  updateBlocks: ReturnType<typeof useDocument>["updateBlocks"];
}): void {
  const W = args.resizeCtx.columnRowWidthPx;
  const { dx, resizeKind, resizeCtx } = args;
  if (W <= 0 || dx === 0) return;

  const doc = args.documentBlocks;
  const colBlock = doc.blocks.find(
    (b) => b.id === resizeCtx.columnsBlockId && b.type === "columns"
  );
  if (
    !colBlock ||
    colBlock.type !== "columns" ||
    colBlock.blocks.length !== resizeCtx.siblingCount
  ) {
    return;
  }

  const spans = colBlock.blocks.map((c) => c.span);
  const T = spans.reduce((acc, s) => acc + s, 0);
  if (T <= 0) return;

  const deltaSpan = (dx * T) / W;
  const i = resizeCtx.childIndex;

  let nextSpans: number[];
  if (resizeKind === "left" && i > 0) {
    nextSpans = transferSpansBetweenNeighbors(
      spans,
      i - 1,
      i,
      deltaSpan,
      MIN_COLUMN_SPAN
    );
  } else if (resizeKind === "right" && i < resizeCtx.siblingCount - 1) {
    nextSpans = transferSpansBetweenNeighbors(
      spans,
      i,
      i + 1,
      deltaSpan,
      MIN_COLUMN_SPAN
    );
  } else {
    nextSpans = spans;
  }

  const unchanged =
    nextSpans.length === spans.length &&
    nextSpans.every((s, idx) => s === spans[idx]);
  if (unchanged) return;

  args.updateBlocks((current) => {
    return {
      ...current,
      blocks: current.blocks.map((b) => {
        if (b.type !== "columns" || b.id !== resizeCtx.columnsBlockId) return b;
        if (b.blocks.length !== resizeCtx.siblingCount) return b;
        return {
          ...b,
          blocks: b.blocks.map((child, iChild) => ({
            ...child,
            span: nextSpans[iChild] ?? child.span,
          })),
        };
      }),
    };
  });
}

function DraggingFillPreview({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <Group x={x} y={y} width={width} height={height}>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="#fff7ea"
        stroke="#e37100"
        strokeWidth={1}
      />
    </Group>
  );
}

function ActiveColumnResizePreview({
  x,
  y,
  width,
  height,
  activeColumnResize,
  resizeGripY,
  resizeGripHeight,
  resizeIndicatorHeight,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  activeColumnResize: { kind: "left" | "right"; dx: number };
  resizeGripY: number;
  resizeGripHeight: number;
  resizeIndicatorHeight: number;
}) {
  return (
    <Group x={x} y={y} width={width} height={height}>
      <Rect
        x={activeColumnResize.kind === "left" ? activeColumnResize.dx : 0}
        y={0}
        width={
          activeColumnResize.kind === "left"
            ? Math.max(0, width - activeColumnResize.dx)
            : Math.max(0, width + activeColumnResize.dx)
        }
        height={resizeIndicatorHeight}
        fill="#fff7ea"
        stroke="#e37100"
        strokeWidth={1}
        opacity={0.45}
        perfectDrawEnabled={false}
        listening={false}
      />
      <Rect
        x={
          (activeColumnResize.kind === "left" ? 0 : width) +
          activeColumnResize.dx -
          COLUMN_RESIZE_GRIP_WIDTH / 2
        }
        y={resizeGripY}
        width={COLUMN_RESIZE_GRIP_WIDTH}
        height={resizeGripHeight}
        fill="#ffffff"
        stroke="#e37100"
        strokeWidth={1}
        cornerRadius={2}
        perfectDrawEnabled={false}
        listening={false}
      />
    </Group>
  );
}

function useInteractableBlockController(args: {
  blockId: string;
  width: number;
  height: number;
  dpi: number;
  disabled: boolean;
  inFocus: boolean;
  onContextMenu?: (p: {
    event: Konva.KonvaEventObject<MouseEvent>;
    anchor: NormalizedAnchorRect;
  }) => void;
  onClick?: (p: {
    event: Konva.KonvaEventObject<MouseEvent>;
    anchor: NormalizedAnchorRect;
  }) => void;
  columnsResizeContext?: ColumnsResizeContext;
  setAction: DocumentStoreState["setAction"];
  resizeColumnAction: DocumentStoreResizeColumnAction | null;
  commitReorder: () => void;
  updateBlocks: ReturnType<typeof useDocument>["updateBlocks"];
  documentBlocks: NonNullable<
    ReturnType<typeof useDocument>["document"]
  > | null;
}) {
  const {
    blockId,
    width,
    height,
    dpi,
    disabled,
    inFocus,
    onContextMenu,
    onClick,
    columnsResizeContext,
    setAction,
    resizeColumnAction,
    commitReorder,
    updateBlocks,
    documentBlocks,
  } = args;

  const groupRef = useRef<Konva.Group | null>(null);
  const assignGroupRef = useCallback((n: Konva.Group | null) => {
    groupRef.current = n;
  }, []);
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  /** Derived from the global `resize-column` action — only present for the originating block. */
  const activeColumnResize = useMemo(() => {
    if (
      !resizeColumnAction ||
      resizeColumnAction.blockId !== blockId
    ) {
      return null;
    }
    return {
      kind: resizeColumnAction.kind,
      dx:
        resizeColumnAction.pointerCurrent.x -
        resizeColumnAction.pointerStart.x,
    };
  }, [resizeColumnAction, blockId]);

  const handleContextMenu = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.evt.preventDefault();
      if (!onContextMenu) return;
      const node = groupRef.current;
      if (!node) return;
      const anchor = normalizedAnchorRectForNode(node);
      if (!anchor) return;
      onContextMenu({ event, anchor });
    },
    [onContextMenu]
  );

  const handleClick = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (event.evt.button !== 0) return;
      if (disabled) return;
      event.cancelBubble = true;
      event.evt.preventDefault();
      if (!onClick) return;
      const node = groupRef.current;
      if (!node) return;
      const anchor = normalizedAnchorRectForNode(node);
      if (!anchor) return;
      onClick({ event, anchor });
    },
    [onClick, disabled]
  );

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;
    setHovered(true);
  }, [disabled]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = groupRef.current;
      const stage = node?.getStage();
      const pointerPosition = stage?.getPointerPosition();
      if (!node || !stage || !pointerPosition || disabled) {
        setHovered(false);
        return;
      }

      const localPointerPosition = node
        .getAbsoluteTransform()
        .copy()
        .invert()
        .point(pointerPosition);
      const isPointerInside =
        localPointerPosition.x >= 0 &&
        localPointerPosition.x <= width &&
        localPointerPosition.y >= 0 &&
        localPointerPosition.y <= height;

      setHovered(isPointerInside);
    });

    return () => cancelAnimationFrame(frame);
  }, [disabled, height, inFocus, width]);

  const canResizeLeft =
    columnsResizeContext != null && columnsResizeContext.childIndex > 0;
  const canResizeRight =
    columnsResizeContext != null &&
    columnsResizeContext.childIndex < columnsResizeContext.siblingCount - 1;
  const isColumnResizing = activeColumnResize != null;
  const isHoverActive =
    hovered && !disabled && !isDragging && !isColumnResizing;

  const getPointerCanvasPosition = useCallback((node: Konva.Node) => {
    const stage = node.getStage();
    const pointerPosition = stage?.getPointerPosition();
    if (!pointerPosition) {
      return null;
    }

    const absoluteScale = node.getAbsoluteScale();
    if (absoluteScale.x === 0 || absoluteScale.y === 0) {
      return null;
    }

    return {
      x: pointerPosition.x / absoluteScale.x,
      y: pointerPosition.y / absoluteScale.y,
    };
  }, []);

  const handleDragStart = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      const node = groupRef.current ?? event.target;
      dragStartPosition.current = node.getPosition();
      if (disabled) return;

      const ctx = columnsResizeContext;
      const local = node.getRelativePointerPosition();
      if (ctx && local && ctx.columnRowWidthPx > 0 && ctx.siblingCount > 1) {
        const edgeKind = hitColumnResizeEdge(local.x, width, ctx);
        if (edgeKind) {
          const startPtr = getPointerCanvasPosition(node);
          if (startPtr) {
            setAction({
              type: "resize-column",
              blockId,
              columnsBlockId: ctx.columnsBlockId,
              childIndex: ctx.childIndex,
              siblingCount: ctx.siblingCount,
              kind: edgeKind,
              columnRowWidthPx: ctx.columnRowWidthPx,
              pointerStart: startPtr,
              pointerCurrent: startPtr,
            });
            return;
          }
        }
      }

      const pointerCanvasPosition = getPointerCanvasPosition(node);
      if (pointerCanvasPosition) {
        setAction({
          type: "move-block",
          current: {
            position: pointerCanvasPosition,
            blockIds: [blockId],
          },
          targetBlock: null,
        });
      }
      setIsDragging(true);
    },
    [
      disabled,
      setAction,
      blockId,
      getPointerCanvasPosition,
      columnsResizeContext,
      width,
    ]
  );

  const handleDragMove = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      if (disabled) return;
      const node = groupRef.current ?? event.target;
      const pointerCanvasPosition = getPointerCanvasPosition(node);
      if (!pointerCanvasPosition) {
        return;
      }

      let isResizing = false;
      setAction((current) => {
        const r = asResizeColumnAction(current);
        if (!r || r.blockId !== blockId) return current;
        isResizing = true;
        return { ...r, pointerCurrent: pointerCanvasPosition };
      });
      if (isResizing) {
        resetNodeDragPosition(node, dragStartPosition.current);
        return;
      }

      setAction((current) => {
        const moveAction = asMoveBlockAction(current);
        if (!moveAction) return current;
        return {
          ...moveAction,
          current: {
            position: pointerCanvasPosition,
            blockIds: [blockId],
          },
        };
      });
    },
    [disabled, setAction, blockId, getPointerCanvasPosition]
  );

  const handleDragEnd = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      const node = groupRef.current ?? event.target;

      let endedResize: DocumentStoreResizeColumnAction | null = null;
      setAction((current) => {
        const r = asResizeColumnAction(current);
        if (!r || r.blockId !== blockId) return current;
        endedResize = r;
        return null;
      });

      setIsDragging(false);

      if (endedResize) {
        const resize: DocumentStoreResizeColumnAction = endedResize;
        const resizeCtx = columnsResizeContext;
        const ptrEnd = getPointerCanvasPosition(node);
        resetNodeDragPosition(node, dragStartPosition.current);
        if (resizeCtx && documentBlocks) {
          const dx =
            (ptrEnd?.x ?? resize.pointerCurrent.x) - resize.pointerStart.x;
          patchColumnSpansAfterResizeDrag({
            dx,
            resizeKind: resize.kind,
            resizeCtx,
            documentBlocks,
            updateBlocks,
          });
        }
        return;
      }

      commitReorder();
      resetNodeDragPosition(node, dragStartPosition.current);
    },
    [
      blockId,
      commitReorder,
      columnsResizeContext,
      getPointerCanvasPosition,
      documentBlocks,
      setAction,
      updateBlocks,
    ]
  );

  /** Konva drag-cancel payload is unreliable; clear any in-flight gesture for this block. */
  const handleDragCancel = useCallback(() => {
    const node = groupRef.current;
    setIsDragging(false);
    setAction((current) => {
      if (asMoveBlockAction(current)) return null;
      const r = asResizeColumnAction(current);
      if (r && r.blockId === blockId) return null;
      return current;
    });
    if (node) {
      resetNodeDragPosition(node, dragStartPosition.current);
    }
  }, [blockId, setAction]);

  const innerStroke = 0.01 * dpi;
  const outerStroke = 0.03 * dpi;
  /** Space between the outer edge of the inner stroke and the inner edge of the outer stroke. */
  const ringGap = 0;
  const padding = innerStroke / 2 + ringGap + outerStroke / 2;
  const innerRadius = 0.01 * dpi;
  const outerRadius = innerRadius + padding;

  const showInnerRing = isHoverActive || inFocus;
  const showOuterHoverRing = isHoverActive;
  const showResizeHandles =
    !disabled && !isDragging && !isColumnResizing && (hovered || inFocus);
  const resizeIndicatorHeight = Math.max(height, 16);
  const resizeGripHeight = Math.min(
    COLUMN_RESIZE_GRIP_HEIGHT_MAX,
    Math.max(COLUMN_RESIZE_GRIP_HEIGHT_MIN, height * 0.28)
  );
  const resizeGripY = (height - resizeGripHeight) / 2;

  return {
    assignGroupRef,
    handleContextMenu,
    handleClick,
    handleMouseEnter,
    handleMouseLeave,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
    innerStroke,
    outerStroke,
    padding,
    innerRadius,
    outerRadius,
    isDragging,
    activeColumnResize,
    canResizeLeft,
    canResizeRight,
    showInnerRing,
    showOuterHoverRing,
    showResizeHandles,
    resizeGripY,
    resizeGripHeight,
    resizeIndicatorHeight,
  };
}

export function InteractableBlock({
  blockId,
  x,
  y,
  width,
  height,
  dpi = 300,
  children,
  onContextMenu,
  onClick,
  inFocus = false,
  disabled = false,
  columnsResizeContext,
}: {
  blockId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dpi?: number;
  inFocus?: boolean;
  disabled?: boolean;
  columnsResizeContext?: ColumnsResizeContext;
  children: React.ReactNode;
  onContextMenu?: (args: {
    event: Konva.KonvaEventObject<MouseEvent>;
    anchor: { left: number; top: number; width: number; height: number };
  }) => void;
  onClick?: (args: {
    event: Konva.KonvaEventObject<MouseEvent>;
    anchor: { left: number; top: number; width: number; height: number };
  }) => void;
}) {
  const { documentStore, blockTree, updateBlocks, document } = useDocument();

  const commitReorder = useCallback(() => {
    if (!document) return;
    const state = documentStore.getState();
    const moveAction = selectMoveBlockAction(state);
    if (!moveAction?.targetBlock) {
      // No drop target — discard the in-flight move without mutating the doc.
      state.setAction((current) =>
        asMoveBlockAction(current) ? null : current
      );
      return;
    }

    updateBlocks((current) => {
      const next = buildMoveUpdatesForReorder({
        snapshot: current,
        move: moveAction,
        blockTree,
      });
      if (!next) return current;
      return next;
    });

    state.setAction((current) => (asMoveBlockAction(current) ? null : current));
  }, [document, documentStore, updateBlocks, blockTree]);

  const setAction = useStore(documentStore, (s) => s.setAction);
  const resizeColumnAction = useStore(documentStore, selectResizeColumnAction);

  const {
    assignGroupRef,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
    handleMouseEnter,
    handleMouseLeave,
    handleContextMenu,
    handleClick,
    innerStroke,
    outerStroke,
    padding,
    innerRadius,
    outerRadius,
    isDragging,
    activeColumnResize,
    canResizeLeft,
    canResizeRight,
    showInnerRing,
    showOuterHoverRing,
    showResizeHandles,
    resizeGripY,
    resizeGripHeight,
    resizeIndicatorHeight,
  } = useInteractableBlockController({
    blockId,
    width,
    height,
    dpi,
    disabled,
    inFocus,
    onContextMenu,
    onClick,
    columnsResizeContext,
    setAction,
    resizeColumnAction,
    commitReorder,
    updateBlocks,
    documentBlocks: document,
  });

  return (
    <>
      {isDragging && (
        <DraggingFillPreview x={x} y={y} width={width} height={height} />
      )}
      <Group
        ref={assignGroupRef}
        x={x}
        y={y}
        width={width}
        height={height}
        draggable={!disabled}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        opacity={isDragging ? 0.5 : 1}
      >
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          perfectDrawEnabled={false}
        />
        {showInnerRing && (
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            fillEnabled={false}
            stroke="#ffb86a"
            strokeWidth={innerStroke}
            cornerRadius={innerRadius}
            perfectDrawEnabled={false}
            listening={false}
          />
        )}
        {showOuterHoverRing && (
          <Rect
            x={-padding}
            y={-padding}
            width={width + 2 * padding}
            height={height + 2 * padding}
            fillEnabled={false}
            stroke="#ffb86a3f"
            strokeWidth={outerStroke}
            cornerRadius={outerRadius}
            perfectDrawEnabled={false}
            listening={false}
          />
        )}
        {children}
        {showResizeHandles && canResizeLeft && (
          <Rect
            x={-COLUMN_RESIZE_GRIP_WIDTH / 2}
            y={resizeGripY}
            width={COLUMN_RESIZE_GRIP_WIDTH}
            height={resizeGripHeight}
            fill="#ffffff"
            stroke="#e37100"
            strokeWidth={1}
            cornerRadius={2}
            perfectDrawEnabled={false}
            listening={false}
          />
        )}
        {showResizeHandles && canResizeRight && (
          <Rect
            x={width - COLUMN_RESIZE_GRIP_WIDTH / 2}
            y={resizeGripY}
            width={COLUMN_RESIZE_GRIP_WIDTH}
            height={resizeGripHeight}
            fill="#ffffff"
            stroke="#e37100"
            strokeWidth={1}
            cornerRadius={2}
            perfectDrawEnabled={false}
            listening={false}
          />
        )}
      </Group>
      {activeColumnResize && (
        <ActiveColumnResizePreview
          x={x}
          y={y}
          width={width}
          height={height}
          activeColumnResize={activeColumnResize}
          resizeGripY={resizeGripY}
          resizeGripHeight={resizeGripHeight}
          resizeIndicatorHeight={resizeIndicatorHeight}
        />
      )}
    </>
  );
}
