"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Rect } from "react-konva";
import Konva from "konva";
import { BlockTree, type ColumnsResizeContext } from "@/blocks/renderer-types";
import { useDocument } from "@/blocks/document-context";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
// import { useBlockDragContext } from "./block-dnd-context";
// import { useBlockFocusContext } from "./block-focus-context";

export function useInteractableBlock({
  focusBlockId,
  parents,
  blockId,
  blockTree,
}: {
  focusBlockId: string | null;
  parents: string[];
  blockId: string;
  blockTree: BlockTree;
}) {
  let isDisabled;
  if (focusBlockId !== null) {
    // Top level, can still focus. But not if it's child is focused.
    if (parents.length === 0) {
      isDisabled = blockTree.isNodeParentOf({
        parent: blockId,
        child: focusBlockId,
      });
      if (!isDisabled) {
        isDisabled = blockId === focusBlockId;
      }
    } else {
      isDisabled = parents[parents.length - 1] !== focusBlockId;
      // If parent block is not focused, we try to see if the current block
      if (isDisabled) {
        isDisabled =
          parents[parents.length - 1] !==
          blockTree.getDirectParentOf(focusBlockId);
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
  const groupRef = useRef<Konva.Group | null>(null);
  const [hovered, setHovered] = useState(false);
  const { documentStore, updateQueueStore, blockTree } = useDocument();
  const {
    setReorder,
    setReorderTarget,
    commitReorder,
    documentId,
    patchDocument,
  } = useStore(
    documentStore,
    useShallow((s) => ({
      setReorder: s.setReorderCurrent,
      setReorderTarget: s.setReorderTarget,
      commitReorder: s.commitReorder,
      documentId: s.documentId,
      patchDocument: s.update,
    }))
  );

  const columnResizeKindRef = useRef<null | "left" | "right">(null);
  const pointerStartCanvasRef = useRef<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.evt.preventDefault();
      if (!onContextMenu) return;
      const node = groupRef.current;
      const stage = node?.getStage();
      const container = stage?.container();
      if (!node || !stage || !container) return;

      const stageRect = container.getBoundingClientRect();
      const r = node.getClientRect();
      onContextMenu({
        event,
        anchor: {
          left: r.x / stageRect.width,
          top: (r.y + r.height) / stageRect.height,
          width: r.width / stageRect.width,
          height: r.height / stageRect.height,
        },
      });
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
      const stage = node?.getStage();
      const container = stage?.container();
      if (!node || !stage || !container) return;

      const stageRect = container.getBoundingClientRect();
      const r = node.getClientRect();
      onClick({
        event,
        anchor: {
          left: r.x / stageRect.width,
          top: (r.y + r.height) / stageRect.height,
          width: r.width / stageRect.width,
          height: r.height / stageRect.height,
        },
      });
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

  const [isDragging, setIsDragging] = useState(false);
  const [activeColumnResize, setActiveColumnResize] = useState<{
    kind: "left" | "right";
    dx: number;
  } | null>(null);
  const dragStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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
      // console.log("START");
      dragStartPosition.current = node.getPosition();
      if (disabled) return;

      const ctx = columnsResizeContext;
      const local = node.getRelativePointerPosition();
      if (ctx && local && ctx.columnRowWidthPx > 0 && ctx.siblingCount > 1) {
        const edgePx = Math.min(COLUMN_RESIZE_EDGE_PX, Math.max(width / 3, 8));
        const distLeft = local.x;
        const distRight = width - local.x;
        const idx = ctx.childIndex;
        const n = ctx.siblingCount;
        let edgeKind: null | "left" | "right" = null;
        const hitLeft = idx > 0 && distLeft <= edgePx;
        const hitRight = idx < n - 1 && distRight <= edgePx;
        if (hitLeft && hitRight) {
          edgeKind = distLeft <= distRight ? "left" : "right";
        } else if (hitLeft) {
          edgeKind = "left";
        } else if (hitRight) {
          edgeKind = "right";
        }
        if (edgeKind) {
          const startPtr = getPointerCanvasPosition(node);
          if (startPtr) {
            columnResizeKindRef.current = edgeKind;
            pointerStartCanvasRef.current = startPtr;
            setActiveColumnResize({ kind: edgeKind, dx: 0 });
            return;
          }
        }
      }

      const pointerCanvasPosition = getPointerCanvasPosition(node);
      if (pointerCanvasPosition) {
        setReorder({
          position: pointerCanvasPosition,
          blockIds: [blockId],
        });
      }
      setIsDragging(true);
    },
    [
      disabled,
      setReorder,
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
      if (columnResizeKindRef.current) {
        const ptrStart = pointerStartCanvasRef.current;
        const ptrCurrent = getPointerCanvasPosition(node);
        if (ptrStart && ptrCurrent) {
          setActiveColumnResize({
            kind: columnResizeKindRef.current,
            dx: ptrCurrent.x - ptrStart.x,
          });
        }
        node.position({
          x: dragStartPosition.current.x,
          y: dragStartPosition.current.y,
        });
        node.getLayer()?.batchDraw();
        return;
      }
      const pointerCanvasPosition = getPointerCanvasPosition(node);
      if (!pointerCanvasPosition) {
        return;
      }
      setReorder({
        position: pointerCanvasPosition,
        blockIds: [blockId],
      });
    },
    [disabled, setReorder, blockId, getPointerCanvasPosition]
  );

  const handleDragEnd = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      event.cancelBubble = true;
      // console.log("END");
      const resizeKind = columnResizeKindRef.current;
      const resizeCtx = columnsResizeContext;
      const ptrStart = pointerStartCanvasRef.current;
      const node = groupRef.current ?? event.target;
      columnResizeKindRef.current = null;
      pointerStartCanvasRef.current = null;

      setIsDragging(false);
      setActiveColumnResize(null);

      if (resizeKind && resizeCtx && ptrStart) {
        const ptrEnd = getPointerCanvasPosition(node);
        node.position({
          x: dragStartPosition.current.x,
          y: dragStartPosition.current.y,
        });
        node.getLayer()?.batchDraw();
        if (ptrEnd) {
          const dx = ptrEnd.x - ptrStart.x;
          const W = resizeCtx.columnRowWidthPx;
          if (W > 0 && dx !== 0) {
            const doc = documentStore.getState().document;
            const colBlock = doc.blocks.find(
              (b) => b.id === resizeCtx.columnsBlockId && b.type === "columns"
            );
            if (
              colBlock &&
              colBlock.type === "columns" &&
              colBlock.blocks.length === resizeCtx.siblingCount
            ) {
              const spans = colBlock.blocks.map((c) => c.span);
              const T = spans.reduce((acc, s) => acc + s, 0);
              if (T <= 0) {
                return;
              }
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
              } else if (
                resizeKind === "right" &&
                i < resizeCtx.siblingCount - 1
              ) {
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
              if (!unchanged) {
                patchDocument(updateQueueStore, {
                  type: "columns_spans",
                  documentId,
                  columnsBlockId: resizeCtx.columnsBlockId,
                  spans: nextSpans,
                });
              }
            }
          }
        }
        return;
      }

      commitReorder(updateQueueStore, blockTree);
      node.position({
        x: dragStartPosition.current.x,
        y: dragStartPosition.current.y,
      });
      node.getLayer()?.batchDraw();
    },
    [
      commitReorder,
      updateQueueStore,
      blockTree,
      columnsResizeContext,
      documentStore,
      documentId,
      patchDocument,
      getPointerCanvasPosition,
    ]
  );

  /** Konva drag-cancel payload is unreliable; reset from refs only (no commit). */
  const handleDragCancel = useCallback(() => {
    columnResizeKindRef.current = null;
    pointerStartCanvasRef.current = null;
    const node = groupRef.current;
    setIsDragging(false);
    setActiveColumnResize(null);
    setReorder(null);
    setReorderTarget(null);
    if (node) {
      node.position({
        x: dragStartPosition.current.x,
        y: dragStartPosition.current.y,
      });
      node.getLayer()?.batchDraw();
    }
  }, [setReorder, setReorderTarget]);

  // const innerStroke = 0.2 * dpi;
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

  return (
    <>
      {/* Not draggable! */}
      {isDragging && (
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
      )}
      {/* Draggable! */}
      <Group
        ref={(n) => {
          groupRef.current = n;
        }}
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
      )}
    </>
  );
}
