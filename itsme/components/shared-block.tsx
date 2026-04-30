"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Rect } from "react-konva";
import Konva from "konva";
import { BlockTree } from "@/blocks/renderer-types";
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
}: {
  blockId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dpi?: number;
  inFocus?: boolean;
  disabled?: boolean;
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
  const { setReorder, commitReorder } = useStore(
    documentStore,
    useShallow((s) => ({
      setReorder: s.setReorder,
      commitReorder: s.commitReorder,
    }))
  );

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
  const dragStartPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const isHoverActive = hovered && !disabled && !isDragging;

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
      dragStartPosition.current = event.target.getPosition();
      if (disabled) return;
      const pointerCanvasPosition = getPointerCanvasPosition(event.target);
      if (pointerCanvasPosition) {
        setReorder({
          position: pointerCanvasPosition,
          blockIds: [blockId],
        });
      }
      setIsDragging(true);
    },
    [disabled, setReorder, blockId, getPointerCanvasPosition]
  );

  const handleDragMove = useCallback(
    (event: Konva.KonvaEventObject<DragEvent>) => {
      if (disabled) return;
      const pointerCanvasPosition = getPointerCanvasPosition(event.target);
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
      setIsDragging(false);
      commitReorder(updateQueueStore, blockTree);
      event.target.position({
        x: dragStartPosition.current.x,
        y: dragStartPosition.current.y,
      });
      event.target.getLayer()?.batchDraw();
    },
    [commitReorder, updateQueueStore, blockTree]
  );

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
        onDragCancel={handleDragEnd}
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
      </Group>
    </>
  );
}
