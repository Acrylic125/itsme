"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage, Group } from "react-konva";
import {
  DocumentDefinition,
  layoutDocument,
  resolveDocument,
  PageLayout,
} from "./document-blocks";
import { DocumentRenderProvider } from "./document-render-context";
import { BLOCK_RENDERERS } from "./block-renderers";

export { SAMPLE_RESUME } from "./document-blocks";

const PAGE_GAP = 24;

export function PageCanvas({
  document,
  dpi = 300,
}: {
  document: DocumentDefinition;
  dpi?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      setContainerWidth(
        el.clientWidth || el.getBoundingClientRect().width || 0
      );
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

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
    <div ref={containerRef} style={{ width: "100%" }}>
      {containerWidth !== null && (
        <DocumentRenderProvider document={resolvedDocument}>
          <DocumentStage
            pages={pages}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            scale={scale}
            dpi={dpi}
          />
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
};

function DocumentStage({
  pages,
  pageWidth,
  pageHeight,
  scale,
  dpi,
}: DocumentStageProps) {
  const stageWidth = pageWidth * scale;
  const stageHeight =
    pages.length * (pageHeight + PAGE_GAP) * scale - PAGE_GAP * scale;

  return (
    <Stage width={stageWidth} height={stageHeight} pixelRatio={dpi / 96}>
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
