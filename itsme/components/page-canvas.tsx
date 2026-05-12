"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Group, Stage } from "react-konva";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type { Layer as KonvaLayer } from "konva/lib/Layer";
import { getPageLayoutMetrics } from "@/blocks/renderer";
import { asAddBlockAction, asPasteBlockAction, useDocument } from "@/blocks/document-context";
import { useStore } from "zustand/react";
import { cn } from "@/lib/utils";
import {
  AddBlockPlacementLayer,
  MoveReorderLayer,
} from "./canvas-reorder-target-layer";
import { PageCanvasToolbar } from "./page-canvas-toolbar";

export function PageCanvas() {
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

  const { blocks, dpi, document, documentStore } = useDocument();
  const [canvasPointerInside, setCanvasPointerInside] = useState(false);
  const isAddOrPastePlacementMode = useStore(
    documentStore,
    (s) =>
      asAddBlockAction(s.action) != null || asPasteBlockAction(s.action) != null
  );

  const toggleAddBlockMode = useCallback(
    (blockType: "text" | "list") => {
      const { action } = documentStore.getState();
      const cur = asAddBlockAction(action);
      documentStore.setState({
        action:
          cur?.blockType === blockType
            ? null
            : {
                type: "add-block",
                blockType,
                current: null,
                targetBlock: null,
              },
      });
    },
    [documentStore]
  );
  const { pageWidthPx, pageHeightPx, gapPx, pageStridePx } = useMemo(() => {
    if (!document) {
      return {
        pageWidthPx: 0,
        pageHeightPx: 0,
        gapPx: 0,
        pageStridePx: 0,
      };
    }
    return getPageLayoutMetrics(document, dpi);
  }, [document, dpi]);

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
      <PageCanvasToolbar
        onToggleAddText={() => toggleAddBlockMode("text")}
        onToggleAddList={() => toggleAddBlockMode("list")}
      />
      <div
        className={cn(
          "w-full max-w-7xl overflow-x-hidden h-fit absolute mt-10",
          isAddOrPastePlacementMode && canvasPointerInside && "cursor-crosshair"
        )}
        ref={containerRef}
        onMouseEnter={() => setCanvasPointerInside(true)}
        onMouseLeave={() => setCanvasPointerInside(false)}
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
              fill="#00000000"
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
              <MoveReorderLayer />
              <AddBlockPlacementLayer
                scale={scale}
                stageWidth={stageWidth}
                stageHeight={stageHeight}
              />
            </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
