"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage, Group } from "react-konva";
import {
  layoutDocument,
  resolveDocument,
  PageLayout,
} from "../blocks/renderer-utils";
import { DocumentRenderProvider } from "./document-render-context";
import { DomPopupProvider } from "./dom-popup";
import { BLOCK_RENDERERS } from "./block-renderers";
import { DocumentDefinition } from "@/blocks/schema";

export { SAMPLE_RESUME } from "../blocks/renderer-utils";

const PAGE_GAP = 24;

export function PageCanvas({
  document,
  dpi = 300,
}: {
  document: DocumentDefinition;
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
  const resolvedDocument = useMemo(() => resolveDocument(document), [document]);
  const pages = useMemo<PageLayout[]>(
    () => layoutDocument(resolvedDocument, BLOCK_RENDERERS),
    [resolvedDocument]
  );

  const pageWidth = resolvedDocument.pageSize.width;
  const pageHeight = resolvedDocument.pageSize.height;

  const scale =
    containerWidth != null && containerWidth > 0
      ? containerWidth / pageWidth
      : 1;

  return (
    <div ref={containerRef} className="w-full">
      {containerWidth !== null && (
        <DocumentRenderProvider document={resolvedDocument}>
          <DomPopupProvider>
            <DocumentStage
              pages={pages}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              scale={scale}
              dpi={dpi}
              dpr={dpr}
            />
          </DomPopupProvider>
        </DocumentRenderProvider>
      )}
    </div>
  );
}

type DocumentStageProps = {
  pages: PageLayout[];
  pageWidth: number;
  pageHeight: number;
  scale: number;
  dpi: number;
  dpr: number;
};

function DocumentStage({
  pages,
  pageWidth,
  pageHeight,
  scale,
  dpi,
  dpr,
}: DocumentStageProps) {
  const stageWidth = pageWidth * scale;
  const stageHeight =
    pages.length * (pageHeight + PAGE_GAP) * scale - PAGE_GAP * scale;

  const pixelRatio = (dpi / 96) * dpr;

  return (
    <Stage
      // Force a remount when DPR changes to avoid Konva keeping the old backing store
      key={`${dpi}:${dpr}:${scale}`}
      width={stageWidth}
      height={stageHeight}
      pixelRatio={pixelRatio}
    >
      <Layer>
        {pages.map((page, pageIndex) => {
          const yOffset = pageIndex * (pageHeight + PAGE_GAP) * scale;

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
              {page.blocks.map((block) => {
                const Component = block.component;
                return (
                  <Component
                    key={block.id}
                    x={block.x}
                    y={block.y}
                    width={block.width}
                    height={block.height}
                  />
                );
              })}
            </Group>
          );
        })}
      </Layer>
    </Stage>
  );
}
