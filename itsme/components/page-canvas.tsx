"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage, Text, Group } from "react-konva";
import Konva from "konva";
import jsPDF from "jspdf";
import {
  DocumentDefinition,
  layoutDocument,
  resolveDocument,
  PageLayout,
  computeHoverBounds,
} from "./document-blocks";

export { SAMPLE_RESUME } from "./document-blocks";

const PAGE_GAP = 24;
const HOVER_TRANSITION_S = 0.1;

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
    () => layoutDocument(resolvedDocument),
    [resolvedDocument]
  );

  const pageWidth = resolvedDocument.pageSize.width;
  const pageHeight = resolvedDocument.pageSize.height;

  const scale =
    containerWidth != null && containerWidth > 0
      ? containerWidth / pageWidth
      : 1;

  const handleExportPdf = () => {
    if (pages.length === 0) return;

    const orientation = pageWidth >= pageHeight ? "l" : "p";
    const pdf = new jsPDF({
      orientation,
      unit: "px",
      format: [pageWidth, pageHeight],
    });

    pages.forEach((page, pageIndex) => {
      if (pageIndex > 0) {
        pdf.addPage();
      }

      page.items.forEach((item) => {
        if (item.skipPdf) return;
        // Match Konva's horizontal alignment box.
        let xPx = item.x;
        if (item.align === "center") {
          xPx = item.x + item.width / 2;
        } else if (item.align === "right") {
          xPx = item.x + item.width;
        }

        const fontSizePt = item.fontSize / 0.75; // px -> jsPDF points (per Konva example)
        const yPx = item.y; // Konva uses y as top; we use baseline: 'top' below.
        const maxWidthPx = item.width;

        const fontFamily =
          resolvedDocument.font === "Times New Roman" ? "times" : "helvetica";
        const fontStyle = item.fontWeight === "bold" ? "bold" : "normal";

        pdf.setFont(
          fontFamily as "times" | "helvetica",
          fontStyle as "normal" | "bold"
        );
        pdf.setFontSize(fontSizePt);

        pdf.text(item.text, xPx, yPx, {
          maxWidth: maxWidthPx,
          baseline: "top",
          align: item.align ?? "left",
        });
      });
    });

    const fileName = document?.name || "document";
    pdf.save(`${fileName}.pdf`);
  };

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <button
        type="button"
        onClick={handleExportPdf}
        style={{ marginBottom: 8 }}
      >
        Export as PDF
      </button>
      {containerWidth !== null && (
        <DocumentStage
          pages={pages}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          scale={scale}
          dpi={dpi}
          font={resolvedDocument.font}
        />
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
  font: string;
};

function DocumentStage({
  pages,
  pageWidth,
  pageHeight,
  scale,
  dpi,
  font,
}: DocumentStageProps) {
  const hoverGroupRectRefs = useRef<Map<string, Konva.Rect>>(new Map());
  const hoverGroupTweenRefs = useRef<Map<string, Konva.Tween>>(new Map());
  const hoverClearTimeoutRef = useRef<number | null>(null);
  const [hover, setHover] = useState<{
    pageIndex: number;
    groupId: string;
  } | null>(null);
  const prevHoverRef = useRef<{ pageIndex: number; groupId: string } | null>(
    null
  );

  const hoverBoundsByPage = useMemo(() => computeHoverBounds(pages), [pages]);

  const cancelHoverClear = () => {
    if (hoverClearTimeoutRef.current != null) {
      window.clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }
  };

  const scheduleHoverClear = () => {
    cancelHoverClear();
    hoverClearTimeoutRef.current = window.setTimeout(() => {
      setHover(null);
    }, 40);
  };

  useEffect(() => {
    const prev = prevHoverRef.current;
    const prevKey = prev ? `${prev.pageIndex}:${prev.groupId}` : null;
    const nextKey = hover ? `${hover.pageIndex}:${hover.groupId}` : null;

    const tweenOpacity = (key: string, opacity: number) => {
      const rect = hoverGroupRectRefs.current.get(key);
      if (!rect) return;

      const existing = hoverGroupTweenRefs.current.get(key);
      existing?.destroy();

      const tween = new Konva.Tween({
        node: rect,
        opacity,
        duration: HOVER_TRANSITION_S,
        easing: Konva.Easings.EaseInOut,
      });
      hoverGroupTweenRefs.current.set(key, tween);
      tween.play();
    };

    if (prevKey && prevKey === nextKey) {
      tweenOpacity(prevKey, 1);
      prevHoverRef.current = hover;
      return;
    }

    if (prevKey) {
      tweenOpacity(prevKey, 0);
    }

    if (nextKey) {
      tweenOpacity(nextKey, 1);
    }

    prevHoverRef.current = hover;
  }, [hover]);

  const stageWidth = pageWidth * scale;
  const stageHeight =
    pages.length * (pageHeight + PAGE_GAP) * scale - PAGE_GAP * scale;

  return (
    <Stage
      width={stageWidth}
      height={stageHeight}
      pixelRatio={dpi / 96}
      onMouseLeave={() => setHover(null)}
    >
      <Layer>
        {pages.map((page, pageIndex) => {
          const yOffset = pageIndex * (pageHeight + PAGE_GAP) * scale;
          const hoverBounds = hoverBoundsByPage[pageIndex];

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
              {hoverBounds &&
                Array.from(hoverBounds.entries()).map(([groupId, b]) => {
                  const pad = scale > 0 ? 2 / scale : 2;
                  const key = `${pageIndex}:${groupId}`;
                  return (
                    <Rect
                      key={key}
                      ref={(node) => {
                        if (node) hoverGroupRectRefs.current.set(key, node);
                      }}
                      x={b.x - pad}
                      y={b.y - pad}
                      width={b.width + pad * 2}
                      height={b.height + pad * 2}
                      fill="#f3f1f1"
                      opacity={0}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  );
                })}
              {page.items.map((item, idx) => (
                <Text
                  key={idx}
                  x={item.x}
                  y={item.y}
                  width={item.width}
                  text={item.text}
                  fontFamily={font}
                  fontSize={item.fontSize}
                  lineHeight={item.lineHeight}
                  fontStyle={item.fontWeight === "bold" ? "bold" : "normal"}
                  align={item.align}
                  fill="#000000"
                  perfectDrawEnabled={false}
                  onMouseEnter={() => {
                    cancelHoverClear();
                    if (item.hoverEnterGroup) {
                      setHover({
                        pageIndex,
                        groupId: item.hoverEnterGroup,
                      });
                    }
                  }}
                  onMouseLeave={scheduleHoverClear}
                />
              ))}
            </Group>
          );
        })}
      </Layer>
    </Stage>
  );
}
