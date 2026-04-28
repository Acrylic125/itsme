"use client";

import { useCallback, useRef, useState } from "react";
import { Group, Rect } from "react-konva";
import Konva from "konva";
// import { useBlockDragContext } from "./block-dnd-context";
// import { useBlockFocusContext } from "./block-focus-context";

export function HoverRegion({
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
  x: number;
  y: number;
  width: number;
  height: number;
  dpi?: number;
  inFocus?: boolean;
  disabled?: boolean;
} & {
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
  // const canReceivePointer = !blockId;

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

  const isHoverActive = hovered && !disabled;

  // const innerStroke = 0.2 * dpi;
  const innerStroke = 0.01 * dpi;
  const outerStroke = 0.01 * dpi;
  /** Space between the outer edge of the inner stroke and the inner edge of the outer stroke. */
  const ringGap = 0.005 * dpi;
  const padding = innerStroke / 2 + ringGap + outerStroke / 2;
  const innerRadius = 0.01 * dpi;
  const outerRadius = innerRadius + padding;

  const showInnerRing = isHoverActive || inFocus;
  const showOuterHoverRing = isHoverActive;

  return (
    <Group
      ref={(n) => {
        groupRef.current = n;
      }}
      x={x}
      y={y}
      width={width}
      height={height}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      // listening={canReceivePointer ? undefined : false}
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
          stroke="#ffb86a7f"
          strokeWidth={outerStroke}
          cornerRadius={outerRadius}
          perfectDrawEnabled={false}
          listening={false}
        />
      )}
      {children}
    </Group>
  );
}

export function ReorderRegion({
  x = 0,
  y = 0,
  width,
  height,
  children,
  blockId: _blockId,
}: {
  x?: number;
  y?: number;
  width: number;
  height: number;
  blockId: string;
  children: React.ReactNode;
}) {
  void _blockId;
  const groupRef = useRef<Konva.Group | null>(null);
  /** Set to true on mousedown; cleared on mouseup. Prevents click firing after drag. */
  // const hasDraggedRef = useRef(false);
  // const pendingDragCleanupRef = useRef<(() => void) | null>(null);

  // const dragCtx = useBlockDragContext();
  // const focusCtx = useBlockFocusContext();
  // const isDraggingThisBlock = dragCtx?.dragState?.draggingBlockId === blockId;
  // const canReorderBlock = focusCtx?.canDragBlock(blockId) ?? true;

  // const {
  //   registerBlock,
  //   unregisterBlock,
  //   startDrag,
  //   scale: ctxScale,
  // } = dragCtx ?? {};

  // useEffect(() => {
  //   return () => {
  //     pendingDragCleanupRef.current?.();
  //     pendingDragCleanupRef.current = null;
  //   };
  // }, []);

  // Register / update absolute block bounds after each layout commit. Ancestor
  // groups can move after a reorder even when this component's direct props do not.
  // useLayoutEffect(() => {
  //   if (!registerBlock || !unregisterBlock || !ctxScale) return;
  //   const node = groupRef.current;
  //   if (!node) return;
  //   const stage = node.getStage();
  //   if (!stage) return;

  //   const cr = node.getClientRect();
  //   if (cr.width === 0 && cr.height === 0) return;

  //   registerBlock(blockId, {
  //     x: cr.x / ctxScale,
  //     y: cr.y / ctxScale,
  //     width: cr.width / ctxScale,
  //     height: cr.height / ctxScale,
  //   });

  //   return () => {
  //     unregisterBlock(blockId);
  //   };
  // });

  // const handleMouseDown = useCallback(
  //   // (event: Konva.KonvaEventObject<MouseEvent>) => {
  //   //   if (!startDrag || !ctxScale) return;
  //   //   if (!canReorderBlock) return;
  //   //   if (event.evt.button !== 0) return;
  //   //   event.cancelBubble = true;

  //   //   const node = groupRef.current;
  //   //   if (!node) return;
  //   //   const stage = node.getStage();
  //   //   if (!stage) return;
  //   //   const pos = stage.getPointerPosition();
  //   //   if (!pos) return;

  //   //   hasDraggedRef.current = false;
  //   //   const cr = node.getClientRect();

  //   //   pendingDragCleanupRef.current?.();
  //   //   const startClientX = event.evt.clientX;
  //   //   const startClientY = event.evt.clientY;
  //   //   const blockBounds = {
  //   //     x: cr.x / ctxScale,
  //   //     y: cr.y / ctxScale,
  //   //     width: cr.width / ctxScale,
  //   //     height: cr.height / ctxScale,
  //   //   };

  //   //   const cleanup = () => {
  //   //     window.removeEventListener("mousemove", handleWindowMouseMove);
  //   //     window.removeEventListener("mouseup", handleWindowMouseUp);
  //   //     pendingDragCleanupRef.current = null;
  //   //   };

  //   //   const handleWindowMouseMove = (moveEvent: MouseEvent) => {
  //   //     const dx = moveEvent.clientX - startClientX;
  //   //     const dy = moveEvent.clientY - startClientY;
  //   //     if (Math.hypot(dx, dy) < DRAG_INTENT_THRESHOLD_PX) {
  //   //       return;
  //   //     }

  //   //     cleanup();

  //   //     const container = stage.container();
  //   //     const rect = container.getBoundingClientRect();
  //   //     const mouseDocX = (moveEvent.clientX - rect.left) / ctxScale;
  //   //     const mouseDocY = (moveEvent.clientY - rect.top) / ctxScale;

  //   //     // Capture a snapshot of the reorderable content for the ghost.
  //   //     let ghostImageSrc: string | null = null;
  //   //     try {
  //   //       ghostImageSrc = node.toDataURL({
  //   //         pixelRatio:
  //   //           typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  //   //       });
  //   //     } catch {
  //   //       // Non-critical — ghost falls back to a plain rect.
  //   //     }

  //   //     startDrag(blockId, blockBounds, mouseDocX, mouseDocY, ghostImageSrc);
  //   //     stage.container().style.cursor = "grabbing";
  //   //     hasDraggedRef.current = true;
  //   //   };

  //   //   const handleWindowMouseUp = () => {
  //   //     cleanup();
  //   //   };

  //   //   window.addEventListener("mousemove", handleWindowMouseMove);
  //   //   window.addEventListener("mouseup", handleWindowMouseUp);
  //   //   pendingDragCleanupRef.current = cleanup;
  //   //   event.evt.preventDefault();
  //   // },
  //   // [blockId, canReorderBlock, startDrag, ctxScale]
  // );

  // const handleClick = useCallback(
  //   (event: Konva.KonvaEventObject<MouseEvent>) => {
  //     if (!hasDraggedRef.current) return;
  //     event.cancelBubble = true;
  //   },
  //   []
  // );

  // const handleMouseEnter = useCallback(() => {
  //   if (dragCtx?.dragState) return;
  //   if (!canReorderBlock) return;
  //   groupRef.current
  //     ?.getStage()
  //     ?.container()
  //     .style.setProperty("cursor", "grab");
  // }, [canReorderBlock, dragCtx]);

  // const handleMouseLeave = useCallback(() => {
  //   if (dragCtx?.dragState) return;
  //   groupRef.current
  //     ?.getStage()
  //     ?.container()
  //     .style.setProperty("cursor", "default");
  // }, [dragCtx]);

  return (
    <Group
      ref={(n) => {
        groupRef.current = n;
      }}
      x={x}
      y={y}
      width={width}
      height={height}
      // opacity={isDraggingThisBlock ? 0 : 1}
      // listening={isDraggingThisBlock ? false : undefined}
      // onMouseDown={handleMouseDown}
      // onClick={handleClick}
      // onMouseEnter={handleMouseEnter}
      // onMouseLeave={handleMouseLeave}
    >
      {children}
    </Group>
  );
}
