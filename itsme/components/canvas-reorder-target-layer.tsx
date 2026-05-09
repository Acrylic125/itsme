"use client";

import { useEffect, useMemo, useState } from "react";
import { Rect } from "react-konva";
import { useDocument } from "@/blocks/document-context";
import type { BlockTreeReorderBoundingBox, Pos } from "@/blocks/renderer-types";

/**
 * Highlights reorder drop targets (edge strips) under a canvas-space pointer.
 * Shared by move-block drag and add-block placement.
 */
export function CanvasReorderTargetLayer(props: {
  pointerCanvasPos: Pos | null;
  onActiveTargetChange: (target: BlockTreeReorderBoundingBox | null) => void;
}) {
  const { pointerCanvasPos, onActiveTargetChange } = props;
  const { blockTree } = useDocument();
  const boxes = blockTree.getReorderBoundingBoxes();
  const [targetIndex, setTargetIndex] = useState(0);
  console.log(
    Object.entries(
      boxes.reduce(
        (map, box) => {
          const key = `${box.blockId}:${box.type}`;
          map[key] = (map[key] ?? 0) + 1;
          // const count = map.get(key) ?? 0;
          // map.set(key, count + 1);
          return map;
        },
        {} as Record<string, number>
      )
    ).filter(([_, count]) => count > 1)
  );

  const intersectionTargets = useMemo(() => {
    const targets: (typeof boxes)[number][] = [];
    if (pointerCanvasPos === null) {
      return targets;
    }

    for (let i = boxes.length - 1; i >= 0; i -= 1) {
      const box = boxes[i];
      if (
        pointerCanvasPos.x >= box.target.from.x &&
        pointerCanvasPos.x <= box.target.to.x &&
        pointerCanvasPos.y >= box.target.from.y &&
        pointerCanvasPos.y <= box.target.to.y
      ) {
        targets.push(box);
      }
    }
    return targets;
  }, [boxes, pointerCanvasPos]);

  const intersectionKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const t of intersectionTargets) {
      set.add(`${t.blockId}:${t.type}`);
    }
    return set;
  }, [intersectionTargets]);

  const intersectionSignature = useMemo(
    () =>
      intersectionTargets
        .map(
          (box) =>
            `${box.blockId}:${box.type}:${box.target.from.x}:${box.target.from.y}:${box.target.to.x}:${box.target.to.y}`
        )
        .join("|"),
    [intersectionTargets]
  );

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setTargetIndex(0);
    }, 0);
    if (intersectionTargets.length <= 1) {
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setInterval(() => {
      setTargetIndex((prev) => {
        if (prev >= intersectionTargets.length - 1) {
          window.clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 600);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearInterval(timer);
    };
  }, [intersectionSignature, intersectionTargets.length]);

  const nextReorderTarget =
    intersectionTargets[
      Math.min(targetIndex, intersectionTargets.length - 1)
    ] ?? null;

  useEffect(() => {
    onActiveTargetChange(nextReorderTarget);
  }, [nextReorderTarget, onActiveTargetChange]);

  /** Block ids whose full layout rect contains the pointer (not only edge strips). */
  const blocksUnderPointer = useMemo(() => {
    const set = new Set<string>();
    if (pointerCanvasPos === null) {
      return set;
    }
    const byId = new Map<string, (typeof boxes)[number][]>();
    for (const b of boxes) {
      const list = byId.get(b.blockId);
      if (list) {
        list.push(b);
      } else {
        byId.set(b.blockId, [b]);
      }
    }
    const { x: px, y: py } = pointerCanvasPos;
    for (const [, blockBoxes] of byId) {
      const top = blockBoxes.find((b) => b.type === "top");
      const bottom = blockBoxes.find((b) => b.type === "bottom");
      if (!top || !bottom) continue;
      const x0 = top.visual.from.x;
      const y0 = top.visual.from.y;
      const x1 = bottom.visual.to.x;
      const y1 = bottom.visual.to.y;
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
        set.add(top.blockId);
      }
    }
    return set;
  }, [boxes, pointerCanvasPos]);

  if (pointerCanvasPos === null) {
    return null;
  }

  const reorderTarget = nextReorderTarget;

  return (
    <>
      {boxes.map((box) => {
        const key = `${box.blockId}:${box.type}`;
        const isActive =
          reorderTarget != null &&
          reorderTarget.blockId === box.blockId &&
          reorderTarget.type === box.type;
        if (isActive) {
          return (
            <Rect
              key={`reorder-target-${key}`}
              x={box.visual.from.x}
              y={box.visual.from.y}
              width={box.visual.to.x - box.visual.from.x}
              height={box.visual.to.y - box.visual.from.y}
              fill="#ea580c"
              opacity={0.9}
              perfectDrawEnabled={false}
              listening={false}
            />
          );
        }
        const showBlueHighlight =
          intersectionKeySet.has(key) || blocksUnderPointer.has(box.blockId);
        if (!showBlueHighlight) {
          return null;
        }
        return (
          <Rect
            key={`reorder-target-${key}`}
            x={box.visual.from.x}
            y={box.visual.from.y}
            width={box.visual.to.x - box.visual.from.x}
            height={box.visual.to.y - box.visual.from.y}
            fill="#51A2FF"
            perfectDrawEnabled={false}
            listening={false}
          />
        );
      })}
    </>
  );
}
