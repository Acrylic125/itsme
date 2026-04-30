"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Group, Stage } from "react-konva";
import { DomPopupProvider } from "./dom-popup";
import {
  DocumentSchema,
  getPageLayoutMetrics,
  type RenderedLayoutBlock,
} from "@/blocks/renderer";
import { z } from "zod";
import {
  DocumentStoresProvider,
  useDocumentStore,
  useDocument,
} from "@/blocks/document-context";
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
  const [measurements, setMeasurements] = useState<{
    containerWidth: number | null;
    dpr: number;
  }>({
    containerWidth: null,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  });

  // Keep width + DPR updates in one effect to avoid stale pixel ratios and
  // ensure we react when flex/grid layout changes container width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setMeasurements({
        containerWidth: el.clientWidth || el.getBoundingClientRect().width || 0,
        dpr: window.devicePixelRatio || 1,
      });
    };

    update();
    const rafId = window.requestAnimationFrame(update);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  const { containerWidth, dpr } = measurements;

  return (
    <div ref={containerRef} className="w-full bg-black">
      {containerWidth !== null && (
        <DocumentStoresProvider document={document} dpi={dpi}>
          <PageCanvasKonva
            containerWidth={containerWidth}
            dpi={dpi}
            dpr={dpr}
          />
        </DocumentStoresProvider>
      )}
    </div>
  );
}

function PageCanvasKonva({
  containerWidth,
  dpi,
  dpr,
}: {
  containerWidth: number;
  dpi: number;
  dpr: number;
}) {
  const document = useDocumentStore((s) => s.document);
  const { blocks } = useDocument();
  const { pageWidthPx, pageHeightPx, gapPx, pageStridePx } = useMemo(
    () => getPageLayoutMetrics(document, dpi),
    [document, dpi]
  );
  const pageWidth = pageWidthPx;
  const pageHeight = pageHeightPx;

  const scale = containerWidth > 0 ? containerWidth / pageWidth : 1;

  return (
    <DomPopupProvider>
      <DocumentStage
        blocks={blocks}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        pageStridePx={pageStridePx}
        gapPx={gapPx}
        scale={scale}
        dpi={dpi}
        dpr={dpr}
      />
    </DomPopupProvider>
  );
}

function DocumentStage({
  blocks,
  pageWidth,
  pageHeight,
  pageStridePx,
  gapPx,
  scale,
  dpi,
  dpr,
}: {
  blocks: RenderedLayoutBlock[];
  pageWidth: number;
  pageHeight: number;
  /** Layout stride in px: page height plus inter-page gap (matches renderer `createContext`). */
  pageStridePx: number;
  gapPx: number;
  scale: number;
  dpi: number;
  dpr: number;
}) {
  const maxEndY = blocks.reduce((m, b) => Math.max(m, b.y + b.height), 0);
  const pageCount = Math.max(1, Math.ceil(maxEndY / pageStridePx));
  const stageWidth = pageWidth * scale;
  const stageHeight =
    (pageCount * pageHeight + Math.max(0, pageCount - 1) * gapPx) * scale;

  const requestedPixelRatio = (dpi / 96) * dpr;
  // Very large backing stores can exceed browser canvas limits.
  // Cap pixel ratio for interactive editing stability.
  const pixelRatio = Math.min(requestedPixelRatio, 2);

  return (
    <Stage
      // Force a remount when DPR changes to avoid Konva keeping the old backing store
      key={`${dpi}:${dpr}:${scale}`}
      width={stageWidth}
      height={stageHeight}
      pixelRatio={pixelRatio}
    >
      <Layer>
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
          const yOffset = pageIndex * pageStridePx * scale;
          return (
            <Group key={pageIndex} y={yOffset} scaleX={scale} scaleY={scale}>
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
        <Group scaleX={scale} scaleY={scale}>
          {blocks.map((block) => (
            <Group key={block.id}>{block.component()}</Group>
          ))}
          <ReorderLayer />
        </Group>
      </Layer>
    </Stage>
  );
}

function ReorderLayer() {
  const { blockTree, documentStore } = useDocument();
  const { reorder } = useStore(
    documentStore,
    useShallow((s) => ({
      reorder: s.reorder,
    }))
  );
  const boxes = blockTree.getReorderBoundingBoxes();
  const [targetIndex, setTargetIndex] = useState(0);

  const intersectionTargets = useMemo(() => {
    const targets: (typeof boxes)[number][] = [];
    if (reorder === null) {
      return targets;
    }

    for (let i = boxes.length - 1; i >= 0; i -= 1) {
      const box = boxes[i];
      if (
        reorder.position.x >= box.target.from.x &&
        reorder.position.x <= box.target.to.x &&
        reorder.position.y >= box.target.from.y &&
        reorder.position.y <= box.target.to.y
      ) {
        targets.push(box);
      }
    }
    return targets;
  }, [boxes, reorder]);

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

  const reorderTarget =
    intersectionTargets[
      Math.min(targetIndex, intersectionTargets.length - 1)
    ] ?? null;

  return (
    <>
      {boxes.map((box, index) => {
        const isTarget = reorderTarget === box;
        if (!isTarget) return null;
        return (
          <Rect
            key={`${box.blockId}-${box.type}-${index}`}
            x={box.visual.from.x}
            y={box.visual.from.y}
            width={box.visual.to.x - box.visual.from.x}
            height={box.visual.to.y - box.visual.from.y}
            fill="#2B7FFF"
            perfectDrawEnabled={false}
            listening={false}
          />
        );
      })}
    </>
  );
}
