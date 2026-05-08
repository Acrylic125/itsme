"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Layer, Rect, Group, Stage } from "react-konva";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type { Layer as KonvaLayer } from "konva/lib/Layer";
import { DocumentSchema, getPageLayoutMetrics } from "@/blocks/renderer";
import { z } from "zod";
import { useDocument } from "@/blocks/document-context";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";

export function PageCanvas({
  document,
  dpi = 300,
}: {
  document: z.infer<typeof DocumentSchema> & { id: string };
  dpi?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<KonvaStage | null>(null);
  const layerRef = useRef<KonvaLayer | null>(null);
  const [measurements, setMeasurements] = useState<{
    containerWidth: number | null;
    dpr: number;
  }>({
    containerWidth: null,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  });

  const { blocks } = useDocument();
  const { pageWidthPx, pageHeightPx, gapPx, pageStridePx } = useMemo(
    () => getPageLayoutMetrics(document, dpi),
    [document, dpi]
  );

  const pageWidth = pageWidthPx;
  const pageHeight = pageHeightPx;

  // Keep width + DPR updates in one effect to avoid stale pixel ratios and
  // ensure we react when flex/grid layout changes container width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver((cb) => {
      cb.forEach((update) => {
        setMeasurements({
          containerWidth: update.contentRect.width,
          dpr: window.devicePixelRatio,
        });
      });
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
    };
  }, [pageWidth, pageHeight]);

  useEffect(() => {
    layerRef.current?.canvas.setPixelRatio(measurements.dpr);
    layerRef.current?.batchDraw();
  }, [measurements.dpr]);

  const containerWidth = measurements.containerWidth ?? 0;
  const scale = containerWidth > 0 ? containerWidth / pageWidth : 1;

  const maxEndY = blocks.reduce((m, b) => Math.max(m, b.y + b.height), 0);
  const pageCount = Math.max(1, Math.ceil(maxEndY / pageStridePx));
  const stageWidth = pageWidth;
  const stageHeight =
    pageCount * pageHeight + Math.max(0, pageCount - 1) * gapPx;

  const requestedPixelRatio = (dpi / 96) * measurements.dpr;
  // Very large backing stores can exceed browser canvas limits.
  // Cap pixel ratio for interactive editing stability.
  const pixelRatio = Math.min(requestedPixelRatio, 2);

  return (
    <div className="flex-1 h-screen-safe relative overflow-y-auto flex flex-col w-full items-center">
      <div
        className="w-full max-w-7xl overflow-x-hidden h-fit absolute"
        ref={containerRef}
      >
        <Stage
          width={stageWidth * scale}
          height={stageHeight * scale}
          pixelRatio={pixelRatio}
          ref={stageRef}
        >
          <Layer scaleX={scale} scaleY={scale} ref={layerRef}>
            <Rect
              x={0}
              y={0}
              width={stageWidth}
              height={stageHeight}
              fill="#000000"
              perfectDrawEnabled={false}
              listening={false}
            />
            {Array.from({ length: pageCount }, (_, pageIndex) => {
              const yOffset = pageIndex * pageStridePx;
              return (
                <Group key={pageIndex} y={yOffset}>
                  <Rect
                    x={0}
                    y={0}
                    width={pageWidth}
                    height={pageHeight}
                    stroke="#e5e5e5"
                    fill="#ffffff"
                    cornerRadius={2}
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                </Group>
              );
            })}
            <Group>
              {blocks.map((block) => (
                <Group key={block.id}>{block.component()}</Group>
              ))}
              <ReorderLayer />
            </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

function ReorderLayer() {
  const { blockTree, documentStore } = useDocument();
  const { reorderCurrent, reorderTarget, setReorderTarget } = useStore(
    documentStore,
    useShallow((s) => ({
      reorderCurrent: s.reorder.current,
      reorderTarget: s.reorder.targetBlock,
      setReorderTarget: s.setReorderTarget,
    }))
  );
  const boxes = blockTree.getReorderBoundingBoxes();
  const [targetIndex, setTargetIndex] = useState(0);

  const intersectionTargets = useMemo(() => {
    const targets: (typeof boxes)[number][] = [];
    if (reorderCurrent === null) {
      return targets;
    }

    for (let i = boxes.length - 1; i >= 0; i -= 1) {
      const box = boxes[i];
      if (
        reorderCurrent.position.x >= box.target.from.x &&
        reorderCurrent.position.x <= box.target.to.x &&
        reorderCurrent.position.y >= box.target.from.y &&
        reorderCurrent.position.y <= box.target.to.y
      ) {
        targets.push(box);
      }
    }
    return targets;
  }, [boxes, reorderCurrent]);

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
    setReorderTarget(nextReorderTarget);
  }, [nextReorderTarget, setReorderTarget]);

  /** Block ids whose full layout rect contains the pointer (not only edge target strips). */
  const blocksUnderPointer = useMemo(() => {
    const set = new Set<string>();
    if (reorderCurrent === null) {
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
    const { x: px, y: py } = reorderCurrent.position;
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
  }, [boxes, reorderCurrent]);

  if (reorderCurrent === null) {
    return null;
  }

  return (
    <>
      {/* Any block the pointer is over: show edge strips that are not hit targets / not active */}
      {boxes.map((box) => {
        if (!blocksUnderPointer.has(box.blockId)) {
          return null;
        }
        if (
          intersectionTargets.some(
            (t) => t.blockId === box.blockId && t.type === box.type
          )
        ) {
          return null;
        }
        const isActive =
          reorderTarget != null &&
          reorderTarget.blockId === box.blockId &&
          reorderTarget.type === box.type;
        if (isActive) {
          return null;
        }
        return (
          <Rect
            key={`hover-edge-${box.blockId}-${box.type}`}
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
      {/* Edge target strips currently under the pointer (excluding active — drawn last) */}
      {intersectionTargets.map((box) => {
        const isActive =
          reorderTarget != null &&
          reorderTarget.blockId === box.blockId &&
          reorderTarget.type === box.type;
        if (isActive) {
          return null;
        }
        return (
          <Rect
            key={`potential-${box.blockId}-${box.type}`}
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
      {reorderTarget && (
        <Rect
          key={`active-${reorderTarget.blockId}-${reorderTarget.type}`}
          x={reorderTarget.visual.from.x}
          y={reorderTarget.visual.from.y}
          width={reorderTarget.visual.to.x - reorderTarget.visual.from.x}
          height={reorderTarget.visual.to.y - reorderTarget.visual.from.y}
          fill="#ea580c"
          opacity={0.9}
          perfectDrawEnabled={false}
          listening={false}
        />
      )}
    </>
  );
}
