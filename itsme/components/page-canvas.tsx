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

type DocumentStageProps = {
  blocks: RenderedLayoutBlock[];
  pageWidth: number;
  pageHeight: number;
  /** Layout stride in px: page height plus inter-page gap (matches renderer `createContext`). */
  pageStridePx: number;
  gapPx: number;
  scale: number;
  dpi: number;
  dpr: number;
};

function DocumentStage({
  blocks,
  pageWidth,
  pageHeight,
  pageStridePx,
  gapPx,
  scale,
  dpi,
  dpr,
}: DocumentStageProps) {
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
        </Group>
      </Layer>
    </Stage>
  );
}
