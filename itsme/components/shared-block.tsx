"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group, Rect } from "react-konva";
import Konva from "konva";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { useBlockDragContext } from "./block-dnd-context";

const DRAG_INTENT_THRESHOLD_PX = 6;

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
  blockId,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  dpi?: number;
  inFocus?: boolean;
  /** When provided, registers this region as a draggable block. */
  blockId?: string;
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
  /** Ref to the inner Group wrapping only children (no rings), used for image capture. */
  const contentGroupRef = useRef<Konva.Group | null>(null);
  const [hovered, setHovered] = useState(false);
  /** Set to true on mousedown; cleared on mouseup. Prevents click firing after drag. */
  const hasDraggedRef = useRef(false);
  const pendingDragCleanupRef = useRef<(() => void) | null>(null);

  const dragCtx = useBlockDragContext();
  const isDraggingThisBlock =
    !!blockId && dragCtx?.dragState?.draggingBlockId === blockId;
  const isAnyDrag = !!dragCtx?.dragState;

  const { registerBlock, unregisterBlock, startDrag, scale: ctxScale } =
    dragCtx ?? {};

  useEffect(() => {
    return () => {
      pendingDragCleanupRef.current?.();
      pendingDragCleanupRef.current = null;
    };
  }, []);

  // Register / update block bounds whenever the block's position or size changes.
  useLayoutEffect(() => {
    if (!blockId || !registerBlock || !unregisterBlock || !ctxScale) return;
    const node = groupRef.current;
    if (!node) return;
    const stage = node.getStage();
    if (!stage) return;

    const cr = node.getClientRect();
    if (cr.width === 0 && cr.height === 0) return;

    registerBlock(blockId, {
      x: cr.x / ctxScale,
      y: cr.y / ctxScale,
      width: cr.width / ctxScale,
      height: cr.height / ctxScale,
    });

    return () => {
      unregisterBlock(blockId);
    };
  }, [blockId, x, y, width, height, registerBlock, unregisterBlock, ctxScale]);

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
      if (hasDraggedRef.current) return;
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
    [onClick]
  );

  const handleMouseDown = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (!blockId || !startDrag || !ctxScale) return;
      if (event.evt.button !== 0) return;

      const node = groupRef.current;
      if (!node) return;
      const stage = node.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      hasDraggedRef.current = false;
      const cr = node.getClientRect();

      pendingDragCleanupRef.current?.();
      const startClientX = event.evt.clientX;
      const startClientY = event.evt.clientY;
      const blockBounds = {
        x: cr.x / ctxScale,
        y: cr.y / ctxScale,
        width: cr.width / ctxScale,
        height: cr.height / ctxScale,
      };

      const cleanup = () => {
        window.removeEventListener("mousemove", handleWindowMouseMove);
        window.removeEventListener("mouseup", handleWindowMouseUp);
        pendingDragCleanupRef.current = null;
      };

      const handleWindowMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startClientX;
        const dy = moveEvent.clientY - startClientY;
        if (Math.hypot(dx, dy) < DRAG_INTENT_THRESHOLD_PX) {
          return;
        }

        cleanup();

        const container = stage.container();
        const rect = container.getBoundingClientRect();
        const mouseDocX = (moveEvent.clientX - rect.left) / ctxScale;
        const mouseDocY = (moveEvent.clientY - rect.top) / ctxScale;

        // Capture a snapshot of the block's content (no hover rings) for the ghost.
        let ghostImageSrc: string | null = null;
        try {
          const contentNode = contentGroupRef.current;
          if (contentNode) {
            ghostImageSrc = contentNode.toDataURL({
              pixelRatio:
                typeof window !== "undefined"
                  ? window.devicePixelRatio || 1
                  : 1,
            });
          }
        } catch {
          // Non-critical — ghost falls back to a plain rect.
        }

        startDrag(blockId, blockBounds, mouseDocX, mouseDocY, ghostImageSrc);
        stage.container().style.cursor = "grabbing";
        hasDraggedRef.current = true;
      };

      const handleWindowMouseUp = () => {
        cleanup();
      };

      window.addEventListener("mousemove", handleWindowMouseMove);
      window.addEventListener("mouseup", handleWindowMouseUp);
      pendingDragCleanupRef.current = cleanup;
      event.evt.preventDefault();
    },
    [blockId, startDrag, ctxScale]
  );

  const handleMouseEnter = useCallback(() => {
    if (dragCtx?.dragState) return;
    setHovered(true);
    if (blockId && dragCtx) {
      groupRef.current?.getStage()?.container().style.setProperty(
        "cursor",
        "grab"
      );
    }
  }, [blockId, dragCtx]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    if (blockId && dragCtx && !dragCtx.dragState) {
      groupRef.current?.getStage()?.container().style.setProperty(
        "cursor",
        "default"
      );
    }
  }, [blockId, dragCtx]);

  const innerStroke = 0.01 * dpi;
  const outerStroke = 0.01 * dpi;
  /** Space between the outer edge of the inner stroke and the inner edge of the outer stroke. */
  const ringGap = 0.005 * dpi;
  const padding = innerStroke / 2 + ringGap + outerStroke / 2;
  const innerRadius = 0.01 * dpi;
  const outerRadius = innerRadius + padding;

  const showInnerRing =
    ((hovered && !isAnyDrag) || inFocus) && !isDraggingThisBlock;
  const showOuterHoverRing =
    hovered && !isAnyDrag && !isDraggingThisBlock;

  return (
    <Group
      ref={(n) => {
        groupRef.current = n;
      }}
      x={x}
      y={y}
      width={width}
      height={height}
      opacity={isDraggingThisBlock ? 0 : 1}
      listening={isDraggingThisBlock ? false : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
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
      <Group ref={(n) => { contentGroupRef.current = n; }}>
        {children}
      </Group>
    </Group>
  );
}

export function SingleTextInputModal({
  defaultValue,
  closePopup,
}: {
  defaultValue: string;
  closePopup: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-card p-4 rounded-xl shadow-xl">
      <Textarea className="w-full" defaultValue={defaultValue} />
      <div className="flex gap-2">
        <Button className="w-fit">Save</Button>
        <Button className="w-fit" variant="outline" onClick={closePopup}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
